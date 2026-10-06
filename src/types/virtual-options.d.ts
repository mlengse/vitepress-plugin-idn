/** Ambient type for the virtual client-options module (T016/T017). */
declare module 'virtual:vitepress-plugin-idn/options' {
  const options: {
    language: import('../core/types').IdnLanguage
    translations: import('../core/types').IdnTranslations
  }
  export default options
}
