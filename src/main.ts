import { createApp } from 'vue'
import 'bootstrap/dist/css/bootstrap.min.css'
import './styles/global.css'
import App from './App.vue'
import { i18n } from './i18n'
import './utils/theme'

createApp(App).use(i18n).mount('#app')
