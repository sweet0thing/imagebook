import ctypes
from ctypes import wintypes
import os
import queue
import shutil
import socket
import subprocess
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
import tkinter as tk
from tkinter import messagebox, scrolledtext, ttk

APP_NAME = "ImageBook"
CONDA_ENV = "imagebook"
JOB_OBJECT_EXTENDED_LIMIT_INFORMATION = 9
JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000


class IoCounters(ctypes.Structure):
    _fields_ = [(name, ctypes.c_uint64) for name in (
        "ReadOperationCount", "WriteOperationCount", "OtherOperationCount",
        "ReadTransferCount", "WriteTransferCount", "OtherTransferCount",
    )]


class JobBasicLimitInformation(ctypes.Structure):
    _fields_ = [
        ("PerProcessUserTimeLimit", ctypes.c_int64),
        ("PerJobUserTimeLimit", ctypes.c_int64),
        ("LimitFlags", wintypes.DWORD),
        ("MinimumWorkingSetSize", ctypes.c_size_t),
        ("MaximumWorkingSetSize", ctypes.c_size_t),
        ("ActiveProcessLimit", wintypes.DWORD),
        ("Affinity", ctypes.c_size_t),
        ("PriorityClass", wintypes.DWORD),
        ("SchedulingClass", wintypes.DWORD),
    ]


class JobExtendedLimitInformation(ctypes.Structure):
    _fields_ = [
        ("BasicLimitInformation", JobBasicLimitInformation),
        ("IoInfo", IoCounters),
        ("ProcessMemoryLimit", ctypes.c_size_t),
        ("JobMemoryLimit", ctypes.c_size_t),
        ("PeakProcessMemoryUsed", ctypes.c_size_t),
        ("PeakJobMemoryUsed", ctypes.c_size_t),
    ]


KERNEL32 = ctypes.WinDLL("kernel32", use_last_error=True)
KERNEL32.CreateJobObjectW.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR]
KERNEL32.CreateJobObjectW.restype = wintypes.HANDLE
KERNEL32.SetInformationJobObject.argtypes = [wintypes.HANDLE, ctypes.c_int, ctypes.c_void_p, wintypes.DWORD]
KERNEL32.SetInformationJobObject.restype = wintypes.BOOL
KERNEL32.AssignProcessToJobObject.argtypes = [wintypes.HANDLE, wintypes.HANDLE]
KERNEL32.AssignProcessToJobObject.restype = wintypes.BOOL
KERNEL32.TerminateJobObject.argtypes = [wintypes.HANDLE, wintypes.UINT]
KERNEL32.TerminateJobObject.restype = wintypes.BOOL
KERNEL32.CloseHandle.argtypes = [wintypes.HANDLE]
KERNEL32.CloseHandle.restype = wintypes.BOOL


class WindowsJob:
    def __init__(self, process):
        self.handle = KERNEL32.CreateJobObjectW(None, None)
        if not self.handle:
            raise OSError(ctypes.get_last_error(), "CreateJobObjectW failed")
        limits = JobExtendedLimitInformation()
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        if not KERNEL32.SetInformationJobObject(self.handle, JOB_OBJECT_EXTENDED_LIMIT_INFORMATION, ctypes.byref(limits), ctypes.sizeof(limits)):
            KERNEL32.CloseHandle(self.handle)
            raise OSError(ctypes.get_last_error(), "SetInformationJobObject failed")
        if not KERNEL32.AssignProcessToJobObject(self.handle, int(process._handle)):
            KERNEL32.CloseHandle(self.handle)
            raise OSError(ctypes.get_last_error(), "AssignProcessToJobObject failed")

    def terminate(self):
        return bool(KERNEL32.TerminateJobObject(self.handle, 1))

    def close(self):
        KERNEL32.CloseHandle(self.handle)


class ImageBookLauncher(tk.Tk):
    def __init__(self):
        super().__init__()
        self.project_dir = Path(sys.executable).parent if getattr(sys, "frozen", False) else Path(__file__).resolve().parent
        self.process = None
        self.job = None
        self.operation = None
        self.stop_requested = False
        self.closing = False
        self.run_id = 0
        self.events = queue.Queue()
        self.service_url = "http://127.0.0.1:3000"

        self.title(APP_NAME)
        self.geometry("720x500")
        self.minsize(600, 400)
        self.protocol("WM_DELETE_WINDOW", self.on_close)
        self._build_ui()
        self._center_window()
        self.after(100, self._drain_events)

    def _build_ui(self):
        style = ttk.Style(self)
        style.configure("Title.TLabel", font=("Microsoft YaHei UI", 20, "bold"))
        style.configure("Status.TLabel", font=("Microsoft YaHei UI", 10))
        style.configure("Action.TButton", font=("Microsoft YaHei UI", 11), padding=(16, 10))

        container = ttk.Frame(self, padding=24)
        container.pack(fill=tk.BOTH, expand=True)
        ttk.Label(container, text=APP_NAME, style="Title.TLabel").pack(anchor=tk.W)
        ttk.Label(container, text="本地图片管理服务", font=("Microsoft YaHei UI", 10)).pack(anchor=tk.W, pady=(2, 18))

        buttons = ttk.Frame(container)
        buttons.pack(fill=tk.X)
        self.compile_button = ttk.Button(buttons, text="编译", style="Action.TButton", command=self.compile_app)
        self.execute_button = ttk.Button(buttons, text="执行", style="Action.TButton", command=self.execute_app)
        self.stop_button = ttk.Button(buttons, text="停止", style="Action.TButton", command=self.stop_app, state=tk.DISABLED)
        self.compile_button.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(0, 6))
        self.execute_button.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=6)
        self.stop_button.pack(side=tk.LEFT, expand=True, fill=tk.X, padx=(6, 0))

        self.status_var = tk.StringVar(value="就绪")
        ttk.Label(container, textvariable=self.status_var, style="Status.TLabel").pack(anchor=tk.W, pady=(18, 8))
        self.log_view = scrolledtext.ScrolledText(
            container,
            height=14,
            font=("Consolas", 10),
            state=tk.DISABLED,
            wrap=tk.WORD,
            relief=tk.FLAT,
            background="#f5f5f5",
        )
        self.log_view.pack(fill=tk.BOTH, expand=True)
        self._append_log("点击“编译”生成最新版本，点击“执行”启动服务并打开网页。")

    def _center_window(self):
        self.update_idletasks()
        x = (self.winfo_screenwidth() - self.winfo_width()) // 2
        y = (self.winfo_screenheight() - self.winfo_height()) // 2
        self.geometry(f"+{x}+{y}")

    def compile_app(self):
        if self.process is not None:
            return
        nuxt_cli = self.project_dir / "node_modules" / "nuxt" / "bin" / "nuxt.mjs"
        if not nuxt_cli.exists():
            self._show_error("未找到 Nuxt，请先在项目目录执行 npm install。")
            return
        self._start_process("build", [str(nuxt_cli), "build"])

    def execute_app(self):
        if self.process is not None:
            return
        server = self.project_dir / ".output" / "server" / "index.mjs"
        if not server.exists():
            self._show_error("尚未找到编译结果，请先点击“编译”。")
            return
        self._start_process("serve", [str(server)])

    def _start_process(self, operation, arguments):
        try:
            conda = self._find_conda()
            node = self._find_node()
            if not (self.project_dir / "package.json").exists():
                raise FileNotFoundError("ImageBook.exe 必须放在 ImageBook 项目根目录。")
            environment = self._load_environment()
            database_url = environment.get("DATABASE_URL", "file:../data/imagebook.sqlite")
            if database_url.startswith("file:"):
                database_path = Path(database_url[5:])
                if not database_path.is_absolute():
                    database_path = (self.project_dir / "prisma" / database_path).resolve()
                database_path.parent.mkdir(parents=True, exist_ok=True)
                environment["DATABASE_URL"] = f"file:{database_path.as_posix()}"
            port = int(environment.get("PORT", "3000"))
            if not 1 <= port <= 65535:
                raise ValueError("PORT 必须是 1 到 65535 之间的数字。")
            self.service_url = f"http://127.0.0.1:{port}"
            if operation == "serve":
                try:
                    with socket.create_connection(("127.0.0.1", port), timeout=1):
                        pass
                except OSError:
                    pass
                else:
                    raise ValueError(f"端口 {port} 已被占用，请停止已有服务或修改 .env 中的 PORT。")
            command = [conda, "run", "-n", CONDA_ENV, "--no-capture-output", node, *arguments]
            startup_info = subprocess.STARTUPINFO()
            startup_info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            startup_info.wShowWindow = subprocess.SW_HIDE
            self.process = subprocess.Popen(
                command,
                cwd=self.project_dir,
                env=environment,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                startupinfo=startup_info,
                creationflags=subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP,
            )
        except (OSError, ValueError) as error:
            self.process = None
            self._show_error(str(error))
            return

        try:
            self.job = WindowsJob(self.process)
        except OSError:
            self.job = None
        self.operation = operation
        self.stop_requested = False
        self.run_id += 1
        self.status_var.set("正在编译…" if operation == "build" else "正在启动服务…")
        self._update_buttons()
        self._append_log(f"使用 Conda 环境：{CONDA_ENV}")
        self._append_log("开始编译。" if operation == "build" else f"正在启动 {self.service_url}")
        threading.Thread(target=self._read_output, args=(self.process, operation), daemon=True).start()
        if operation == "serve":
            threading.Thread(target=self._wait_until_ready, args=(self.process, self.run_id), daemon=True).start()

    def _read_output(self, process, operation):
        if process.stdout is not None:
            for line in process.stdout:
                self.events.put(("log", line.rstrip()))
        return_code = process.wait()
        self.events.put(("exit", process, operation, return_code))

    def _wait_until_ready(self, process, run_id):
        deadline = time.monotonic() + 120
        while time.monotonic() < deadline:
            if process.poll() is not None or self.stop_requested or run_id != self.run_id:
                return
            try:
                with urllib.request.urlopen(f"{self.service_url}/login", timeout=2) as response:
                    if response.status == 200:
                        self.events.put(("ready", process, run_id))
                        return
            except OSError:
                pass
            time.sleep(0.5)
        self.events.put(("timeout", process, run_id))

    def stop_app(self):
        process = self.process
        if process is None or process.poll() is not None:
            return
        self.stop_requested = True
        self.run_id += 1
        self.status_var.set("正在停止…")
        self.stop_button.configure(state=tk.DISABLED)
        self._append_log("正在停止服务进程。" if self.operation == "serve" else "正在取消编译。")
        threading.Thread(target=self._stop_process_tree, args=(process, self.job), daemon=True).start()

    def _stop_process_tree(self, process, job):
        if job is not None and job.terminate():
            return
        startup_info = subprocess.STARTUPINFO()
        startup_info.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup_info.wShowWindow = subprocess.SW_HIDE
        try:
            result = subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                startupinfo=startup_info,
                creationflags=subprocess.CREATE_NO_WINDOW,
                timeout=15,
                check=False,
            )
            if result.returncode != 0 and process.poll() is None:
                process.kill()
                self.events.put(("log", "Windows 未能终止整个进程树，已强制终止主进程。"))
        except (OSError, subprocess.TimeoutExpired):
            if process.poll() is None:
                process.kill()
                self.events.put(("log", "停止进程树失败，已强制终止主进程。"))

    def _drain_events(self):
        for _ in range(200):
            try:
                event = self.events.get_nowait()
            except queue.Empty:
                break
            kind = event[0]
            if kind == "log":
                self._append_log(event[1])
            elif kind == "exit":
                self._handle_exit(*event[1:])
            elif kind == "ready":
                _, process, run_id = event
                if process is self.process and run_id == self.run_id and not self.stop_requested:
                    self.status_var.set(f"服务运行中：{self.service_url}")
                    self._append_log("服务已就绪，正在打开网页。")
                    webbrowser.open(self.service_url)
            elif kind == "timeout":
                _, process, run_id = event
                if process is self.process and run_id == self.run_id and not self.stop_requested:
                    self._append_log("服务启动超时，请检查日志。")
                    self.stop_app()
        if not self.closing or self.process is not None:
            self.after(100, self._drain_events)

    def _handle_exit(self, process, operation, return_code):
        if process is not self.process:
            return
        if self.job is not None:
            self.job.close()
            self.job = None
        self.process = None
        self.operation = None
        if self.closing:
            self.destroy()
            return
        if self.stop_requested:
            self.status_var.set("已停止")
            self._append_log("进程已停止。")
        elif operation == "build" and return_code == 0:
            self.status_var.set("编译完成，可以执行")
            self._append_log("编译成功。")
        elif operation == "serve" and return_code == 0:
            self.status_var.set("服务已退出")
            self._append_log("服务已退出。")
        else:
            message = "编译失败，请查看日志。" if operation == "build" else "服务异常退出，请查看日志。"
            self.status_var.set(message)
            self._append_log(f"{message}（退出码：{return_code}）")
        self._update_buttons()

    def _update_buttons(self):
        running = self.process is not None
        action_state = tk.DISABLED if running else tk.NORMAL
        self.compile_button.configure(state=action_state)
        self.execute_button.configure(state=action_state)
        self.stop_button.configure(state=tk.NORMAL if running and not self.stop_requested else tk.DISABLED)

    def _append_log(self, message):
        if not message:
            return
        self.log_view.configure(state=tk.NORMAL)
        self.log_view.insert(tk.END, f"{message}\n")
        if int(self.log_view.index("end-1c").split(".")[0]) > 2000:
            self.log_view.delete("1.0", "500.0")
        self.log_view.see(tk.END)
        self.log_view.configure(state=tk.DISABLED)

    def _load_environment(self):
        environment = os.environ.copy()
        env_file = self.project_dir / ".env"
        if env_file.exists():
            for raw_line in env_file.read_text(encoding="utf-8-sig").splitlines():
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                if key:
                    environment.setdefault(key, value)
        environment["NODE_ENV"] = "production"
        environment["NITRO_HOST"] = "127.0.0.1"
        return environment

    @staticmethod
    def _find_node():
        node = shutil.which("node")
        if node:
            return node
        local_node = Path(sys.executable).parent / ".tools" / "node.cmd" if getattr(sys, "frozen", False) else Path(__file__).resolve().parent / ".tools" / "node.cmd"
        if local_node.exists():
            return str(local_node)
        raise FileNotFoundError("未找到 Node.js，请安装 Node.js 或保留项目的 .tools 目录。")

    @staticmethod
    def _find_conda():
        candidates = [os.environ.get("CONDA_EXE"), shutil.which("conda")]
        for base in (Path.home(), Path(os.environ.get("LOCALAPPDATA", "")), Path("C:/ProgramData"), Path("D:/")):
            for folder in ("anaconda3", "miniconda3"):
                candidates.append(base / folder / "Scripts" / "conda.exe")
        for candidate in candidates:
            if candidate and Path(candidate).exists():
                return str(candidate)
        raise FileNotFoundError("未找到 Conda，请将 Conda 添加到 PATH。")

    def _show_error(self, message):
        self.status_var.set("操作失败")
        self._append_log(message)
        messagebox.showerror(APP_NAME, message, parent=self)

    def on_close(self):
        if self.process is not None and self.process.poll() is None:
            if not messagebox.askyesno(APP_NAME, "进程仍在运行，是否停止并退出？", parent=self):
                return
            self.closing = True
            self.stop_app()
            return
        self.destroy()


if __name__ == "__main__":
    ImageBookLauncher().mainloop()
