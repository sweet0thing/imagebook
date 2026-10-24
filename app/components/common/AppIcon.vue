<script setup lang="ts">
import spriteUrl from '~/assets/icons/sprite.svg?url'

withDefaults(defineProps<{ name: string; size?: number | string }>(), { size: 20 })
</script>

<template>
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <use :href="`${spriteUrl}#i-${name}`" />
  </svg>
</template>
