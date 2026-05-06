import { ViteReactSSG } from 'vite-react-ssg'
import './index.css'
import './pwa'
import { routes } from './routes'

export const createRoot = ViteReactSSG({ routes })
