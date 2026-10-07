<!--
  Fixture layout (T025).

  Renders the stock default-theme layout unchanged, then appends
  `AuthorUtils` into its `layout-bottom` slot so the public-entry utilities
  are SSR'd onto every page.
-->
<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import AuthorUtils from './AuthorUtils.vue'

const { Layout } = DefaultTheme
</script>

<template>
  <Layout>
    <template #layout-bottom>
      <AuthorUtils />
    </template>
  </Layout>
</template>