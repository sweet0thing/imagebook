<script setup lang="ts">
import { ElMessage } from 'element-plus'
import type { Photo } from '~/types'

const props = defineProps<{ photo: Photo }>()
const emit = defineEmits<{ saved: [photo: Photo]; savedAs: [photo: Photo] }>()
const library = useLibraryStore()
const container = ref<HTMLDivElement>()
const ready = ref(false)
const busy = ref(false)
const tool = ref('select')
const color = ref('#e65f4d')
const brushSize = ref(6)
const annotationText = ref('在这里写下标注')
const cropRatio = ref('free')
const selectedId = ref<string | null>(null)
const baseImage = ref('')
const scale = ref(1)
const filters = reactive({ contrast: 0, brightness: 0, saturation: 0 })
const annotations = ref<any[]>([])
const lines = ref<any[]>([])
const history = ref<any[]>([])
const historyIndex = ref(-1)
const saveAsOpen = ref(false)
const saving = ref(false)
const saveForm = reactive({ title: `${props.photo.title || '图片'} 副本`, albumId: props.photo.albumId, format: 'image/png', quality: 0.92 })
let Konva: any
let stage: any
let baseLayer: any
let objectLayer: any
let drawingLayer: any
let cropLayer: any
let imageNode: any
let cropRect: any
let cropTransformer: any
let drawing = false
let activeLine: any
let activeLineNode: any

const canUndo = computed(() => historyIndex.value > 0)
const canRedo = computed(() => historyIndex.value >= 0 && historyIndex.value < history.value.length - 1)

onMounted(async () => {
  Konva = (await import('konva')).default
  baseImage.value = props.photo.imageUrl
  await buildStage()
  commit()
})
onBeforeUnmount(() => stage?.destroy())

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = reject
    image.src = src
  })
}

async function buildStage() {
  const image = await loadImage(baseImage.value)
  await nextTick()
  if (!container.value) return
  const parent = container.value.parentElement!
  const availableWidth = Math.max(280, parent.clientWidth - 48)
  const availableHeight = Math.max(260, parent.clientHeight - 48)
  scale.value = Math.min(availableWidth / image.naturalWidth, availableHeight / image.naturalHeight, 1)
  stage?.destroy()
  stage = new Konva.Stage({ container: container.value, width: image.naturalWidth * scale.value, height: image.naturalHeight * scale.value })
  baseLayer = new Konva.Layer()
  objectLayer = new Konva.Layer()
  drawingLayer = new Konva.Layer()
  stage.add(baseLayer, drawingLayer, objectLayer)
  imageNode = new Konva.Image({ image, width: stage.width(), height: stage.height(), listening: false })
  baseLayer.add(imageNode)
  applyFilters()
  renderObjects()
  stage.on('mousedown touchstart', startDrawing)
  stage.on('mousemove touchmove', continueDrawing)
  stage.on('mouseup touchend mouseleave', stopDrawing)
  stage.on('click tap', (event: any) => {
    if (event.target === stage && tool.value === 'select') selectedId.value = null
  })
  cropLayer = null
  ready.value = true
}

function applyFilters() {
  if (!imageNode) return
  const active = []
  if (filters.brightness !== 0) active.push(Konva.Filters.Brighten)
  if (filters.contrast !== 0) active.push(Konva.Filters.Contrast)
  if (filters.saturation !== 0) active.push(Konva.Filters.HSL)
  imageNode.cache()
  imageNode.filters(active)
  imageNode.brightness(filters.brightness / 100)
  imageNode.contrast(filters.contrast)
  imageNode.saturation(filters.saturation / 100)
  baseLayer.batchDraw()
}

function snapshot() {
  return JSON.parse(JSON.stringify({ baseImage: baseImage.value, annotations: annotations.value, lines: lines.value, filters }))
}
function commit() {
  history.value = history.value.slice(0, historyIndex.value + 1)
  history.value.push(snapshot())
  if (history.value.length > 15) history.value.shift()
  historyIndex.value = history.value.length - 1
}
async function restore(index: number) {
  if (busy.value) return
  busy.value = true
  try {
    historyIndex.value = index
    const state = history.value[index]
    baseImage.value = state.baseImage
    annotations.value = state.annotations
    lines.value = state.lines
    Object.assign(filters, state.filters)
    selectedId.value = null
    tool.value = 'select'
    await buildStage()
  } finally { busy.value = false }
}

function setTool(next: string) {
  tool.value = next
  selectedId.value = null
  objectLayer?.children?.forEach((node: any) => node.draggable(next === 'select'))
  if (cropLayer) { cropLayer.destroy(); cropLayer = null; cropRect = null }
  if (next === 'crop') createCrop()
  stage?.draw()
}

function createCrop() {
  if (cropLayer) cropLayer.destroy()
  cropLayer = new Konva.Layer()
  stage.add(cropLayer)
  const ratio = cropRatio.value === 'free' ? 0 : cropRatio.value === '1:1' ? 1 : cropRatio.value === '4:3' ? 4 / 3 : 16 / 9
  let width = stage.width() * 0.8
  let height = ratio ? width / ratio : stage.height() * 0.8
  if (height > stage.height() * 0.8) { height = stage.height() * 0.8; width = ratio ? height * ratio : width }
  cropRect = new Konva.Rect({
    x: (stage.width() - width) / 2,
    y: (stage.height() - height) / 2,
    width,
    height,
    stroke: '#ffd166',
    strokeWidth: 2,
    fill: 'rgba(255,209,102,.06)',
    draggable: true
  })
  cropTransformer = new Konva.Transformer({
    nodes: [cropRect],
    rotateEnabled: false,
    anchorSize: 8,
    boundBoxFunc: (oldBox: any, newBox: any) => {
      if (newBox.width < 20 || newBox.height < 20) return oldBox
      if (ratio) newBox.height = newBox.width / ratio
      return newBox
    }
  })
  cropLayer.add(cropRect, cropTransformer)
  cropLayer.draw()
}

function annotationNode(item: any) {
  const common: any = {
    x: item.x,
    y: item.y,
    draggable: tool.value === 'select'
  }
  let node: any
  if (item.type === 'rect') node = new Konva.Rect({ ...common, width: item.width, height: item.height, stroke: item.color, strokeWidth: 3, fill: 'rgba(0,0,0,0)' })
  else if (item.type === 'arrow') node = new Konva.Arrow({ ...common, points: item.points, stroke: item.color, fill: item.color, strokeWidth: 3, pointerLength: 12, pointerWidth: 12 })
  else node = new Konva.Text({ ...common, text: item.text, fontSize: item.fontSize, fill: item.color, fontStyle: 'bold', shadowColor: '#000', shadowBlur: 3, shadowOpacity: 0.5 })
  node.on('click tap', (event: any) => { event.cancelBubble = true; selectedId.value = item.id })
  node.on('dragend', () => {
    item.x = node.x()
    item.y = node.y()
    commit()
  })
  return node
}

function lineNode(item: any) {
  return new Konva.Line({
    points: item.points,
    stroke: item.color,
    strokeWidth: item.size,
    lineCap: 'round',
    lineJoin: 'round',
    listening: false,
    globalCompositeOperation: item.erase ? 'destination-out' : 'source-over'
  })
}

function renderObjects() {
  objectLayer?.destroyChildren()
  drawingLayer?.destroyChildren()
  annotations.value.forEach((item) => objectLayer.add(annotationNode(item)))
  lines.value.forEach((item) => drawingLayer.add(lineNode(item)))
  stage?.draw()
}

function addAnnotation(type: string) {
  setTool('select')
  const item: any = {
    id: crypto.randomUUID(),
    type,
    x: stage.width() * 0.25,
    y: stage.height() * 0.35,
    color: color.value
  }
  if (type === 'rect') Object.assign(item, { width: stage.width() * 0.35, height: stage.height() * 0.25 })
  if (type === 'arrow') Object.assign(item, { points: [0, stage.height() * 0.18, stage.width() * 0.35, 0] })
  if (type === 'text') Object.assign(item, { text: annotationText.value || '文字标注', fontSize: Math.max(18, stage.width() * 0.035) })
  annotations.value.push(item)
  selectedId.value = item.id
  objectLayer.add(annotationNode(item))
  stage.draw()
  commit()
}

function deleteSelected() {
  if (!selectedId.value) return
  annotations.value = annotations.value.filter((item) => item.id !== selectedId.value)
  selectedId.value = null
  renderObjects()
  commit()
}

function updateSelectedColor() {
  const item = annotations.value.find((annotation) => annotation.id === selectedId.value)
  if (!item) return
  item.color = color.value
  renderObjects()
  commit()
}

function startDrawing(event: any) {
  if (!['doodle', 'eraser'].includes(tool.value)) return
  event.evt.preventDefault()
  const position = stage.getPointerPosition()
  if (!position) return
  drawing = true
  activeLine = { id: crypto.randomUUID(), points: [position.x, position.y], color: color.value, size: brushSize.value, erase: tool.value === 'eraser' }
  lines.value.push(activeLine)
  activeLineNode = lineNode(activeLine)
  drawingLayer.add(activeLineNode)
}
function continueDrawing() {
  if (!drawing) return
  const position = stage.getPointerPosition()
  if (!position) return
  activeLine.points.push(position.x, position.y)
  activeLineNode.points(activeLine.points)
  drawingLayer.batchDraw()
}
function stopDrawing() {
  if (!drawing) return
  drawing = false
  commit()
}

function flattenedCanvas() {
  cropLayer?.hide()
  stage.draw()
  const canvas = stage.toCanvas({ pixelRatio: 1 / scale.value })
  cropLayer?.show()
  stage.draw()
  return canvas
}

async function replaceWithCanvas(canvas: HTMLCanvasElement) {
  baseImage.value = canvas.toDataURL('image/png')
  annotations.value = []
  lines.value = []
  Object.assign(filters, { contrast: 0, brightness: 0, saturation: 0 })
  selectedId.value = null
  tool.value = 'select'
  await buildStage()
  commit()
}

async function applyCrop() {
  if (!cropRect) return
  const flat = flattenedCanvas()
  const ratio = 1 / scale.value
  const sourceWidth = cropRect.width() * cropRect.scaleX() * ratio
  const sourceHeight = cropRect.height() * cropRect.scaleY() * ratio
  const output = document.createElement('canvas')
  output.width = Math.max(1, Math.round(sourceWidth))
  output.height = Math.max(1, Math.round(sourceHeight))
  output.getContext('2d')!.drawImage(flat, cropRect.x() * ratio, cropRect.y() * ratio, sourceWidth, sourceHeight, 0, 0, output.width, output.height)
  await replaceWithCanvas(output)
}

async function rotate(clockwise: boolean) {
  const flat = flattenedCanvas()
  const output = document.createElement('canvas')
  output.width = flat.height
  output.height = flat.width
  const context = output.getContext('2d')!
  context.translate(output.width / 2, output.height / 2)
  context.rotate((clockwise ? 90 : -90) * Math.PI / 180)
  context.drawImage(flat, -flat.width / 2, -flat.height / 2)
  await replaceWithCanvas(output)
}

async function flip(horizontal: boolean) {
  const flat = flattenedCanvas()
  const output = document.createElement('canvas')
  output.width = flat.width
  output.height = flat.height
  const context = output.getContext('2d')!
  context.translate(horizontal ? flat.width : 0, horizontal ? 0 : flat.height)
  context.scale(horizontal ? -1 : 1, horizontal ? 1 : -1)
  context.drawImage(flat, 0, 0)
  await replaceWithCanvas(output)
}

function exportBlob(mimeType: string, quality: number): Promise<Blob> {
  cropLayer?.hide()
  stage.draw()
  const dataUrl = stage.toDataURL({ mimeType, quality, pixelRatio: 1 / scale.value })
  cropLayer?.show()
  stage.draw()
  return fetch(dataUrl).then((response) => response.blob())
}

async function saveVersion() {
  saving.value = true
  try {
    const blob = await exportBlob('image/webp', 0.92)
    const form = new FormData()
    form.append('file', blob, `${props.photo.title || 'image'}-v${props.photo.currentVersionNo + 1}.webp`)
    form.append('editorState', JSON.stringify(snapshot()))
    const updated = await $fetch<Photo>(`/api/photos/${props.photo.id}/versions`, { method: 'POST', body: form })
    emit('saved', updated)
    ElMessage.success('已保存为新版本，原图未修改')
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '保存版本失败')
  } finally { saving.value = false }
}

async function saveAs() {
  saving.value = true
  try {
    const extension = saveForm.format === 'image/png' ? 'png' : saveForm.format === 'image/webp' ? 'webp' : 'jpg'
    const blob = await exportBlob(saveForm.format, saveForm.quality)
    const form = new FormData()
    form.append('file', blob, `${saveForm.title || 'image'}.${extension}`)
    form.append('title', saveForm.title)
    if (saveForm.albumId) form.append('albumId', saveForm.albumId)
    form.append('editorState', JSON.stringify(snapshot()))
    const created = await $fetch<Photo>(`/api/photos/${props.photo.id}/save-as`, { method: 'POST', body: form })
    saveAsOpen.value = false
    emit('savedAs', created)
  } catch (error: any) {
    ElMessage.error(error?.data?.statusMessage || '另存为失败')
  } finally { saving.value = false }
}
</script>

<template>
  <div class="editor-page">
    <header class="editor-header">
      <button class="icon-button" title="返回详情" @click="navigateTo(`/photos/${photo.id}`)"><AppIcon name="chevron-left" /></button>
      <h1>{{ photo.title || photo.originalName }}</h1>
      <button class="icon-button" title="撤销" :disabled="!canUndo" @click="restore(historyIndex - 1)"><AppIcon name="undo" /></button>
      <button class="icon-button" title="重做" :disabled="!canRedo" @click="restore(historyIndex + 1)"><AppIcon name="redo" /></button>
      <div class="editor-header-spacer" />
      <button class="secondary-button" @click="saveAsOpen = true"><AppIcon name="copy" :size="16" />另存为</button>
      <button class="primary-button" :disabled="saving || !ready" @click="saveVersion"><AppIcon name="save" :size="16" />保存新版本</button>
    </header>
    <div class="editor-workspace">
      <nav class="editor-tools">
        <button class="editor-tool" :class="{ active: tool === 'select' }" @click="setTool('select')"><AppIcon name="move" /><span>移动</span></button>
        <button class="editor-tool" :class="{ active: tool === 'crop' }" @click="setTool('crop')"><AppIcon name="crop" /><span>裁剪</span></button>
        <button class="editor-tool" @click="rotate(false)"><AppIcon name="rotate-left" /><span>左转</span></button>
        <button class="editor-tool" @click="rotate(true)"><AppIcon name="rotate-right" /><span>右转</span></button>
        <button class="editor-tool" @click="addAnnotation('rect')"><AppIcon name="square" /><span>方框</span></button>
        <button class="editor-tool" @click="addAnnotation('arrow')"><AppIcon name="arrow" /><span>箭头</span></button>
        <button class="editor-tool" @click="addAnnotation('text')"><AppIcon name="text" /><span>文字</span></button>
        <button class="editor-tool" :class="{ active: tool === 'doodle' }" @click="setTool('doodle')"><AppIcon name="brush" /><span>涂鸦</span></button>
        <button class="editor-tool" :class="{ active: tool === 'eraser' }" @click="setTool('eraser')"><AppIcon name="eraser" /><span>橡皮</span></button>
      </nav>
      <div class="editor-stage-wrap"><div ref="container" class="editor-stage" /><span v-if="!ready" class="muted">正在载入画布…</span></div>
      <aside class="editor-properties">
        <template v-if="tool === 'crop'">
          <h3>裁剪</h3>
          <div class="editor-property"><label>宽高比例</label><el-select v-model="cropRatio" size="small" style="width: 100%" @change="createCrop"><el-option label="自由裁剪" value="free" /><el-option label="1 : 1" value="1:1" /><el-option label="4 : 3" value="4:3" /><el-option label="16 : 9" value="16:9" /></el-select></div>
          <button class="primary-button" style="width: 100%" @click="applyCrop"><AppIcon name="check" :size="15" />应用裁剪</button>
          <p class="editor-empty-hint">裁剪会合并当前涂鸦、标注和色彩调节，之后仍可撤销。</p>
        </template>
        <template v-else>
          <h3>工具属性</h3>
          <div v-if="tool === 'doodle' || tool === 'eraser' || selectedId" class="editor-property"><label>颜色</label><input v-model="color" type="color" style="width: 100%; height: 32px; border: 0; background: transparent" @change="updateSelectedColor"></div>
          <div v-if="tool === 'doodle' || tool === 'eraser'" class="editor-property"><label><span>画笔大小</span><span>{{ brushSize }}</span></label><el-slider v-model="brushSize" :min="1" :max="50" /></div>
          <div v-if="selectedId" class="editor-property"><button class="danger-button" style="width: 100%" @click="deleteSelected"><AppIcon name="trash" :size="15" />删除选中标注</button></div>
          <div class="editor-property"><label>文字内容</label><el-input v-model="annotationText" size="small" /></div>
          <div class="editor-property"><label>水平 / 垂直翻转</label><div style="display: flex; gap: 7px"><el-button size="small" @click="flip(true)">水平</el-button><el-button size="small" @click="flip(false)">垂直</el-button></div></div>
        </template>
        <h3>色彩调节</h3>
        <div class="editor-property"><label><span>对比度</span><span>{{ filters.contrast }}</span></label><el-slider v-model="filters.contrast" :min="-100" :max="100" @input="applyFilters" @change="commit" /></div>
        <div class="editor-property"><label><span>亮度</span><span>{{ filters.brightness }}</span></label><el-slider v-model="filters.brightness" :min="-100" :max="100" @input="applyFilters" @change="commit" /></div>
        <div class="editor-property"><label><span>饱和度</span><span>{{ filters.saturation }}</span></label><el-slider v-model="filters.saturation" :min="-100" :max="100" @input="applyFilters" @change="commit" /></div>
        <p class="editor-empty-hint">保存版本不会覆盖原图。标注可拖动位置，涂鸦和色彩调整在导出时合并到图片。</p>
      </aside>
    </div>

    <el-dialog v-model="saveAsOpen" title="另存为独立图片" width="480px">
      <div class="editor-dialog-content">
        <div class="form-row"><label>图片标题</label><el-input v-model="saveForm.title" maxlength="200" /></div>
        <div class="form-row"><label>保存到相册</label><el-select v-model="saveForm.albumId" clearable placeholder="未分类" style="width: 100%"><el-option label="未分类" value="" /><el-option v-for="album in library.albums" :key="album.id" :label="album.name" :value="album.id" /></el-select></div>
        <div class="form-row"><label>文件格式</label><el-radio-group v-model="saveForm.format"><el-radio-button value="image/png">PNG</el-radio-button><el-radio-button value="image/jpeg">JPG</el-radio-button><el-radio-button value="image/webp">WebP</el-radio-button></el-radio-group></div>
        <div v-if="saveForm.format !== 'image/png'" class="form-row"><label>图片质量</label><el-slider v-model="saveForm.quality" :min="0.4" :max="1" :step="0.02" /></div>
      </div>
      <template #footer><el-button @click="saveAsOpen = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveAs">保存到本站</el-button></template>
    </el-dialog>
  </div>
</template>
