import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntApp, ConfigProvider, theme } from 'antd'
import thTH from 'antd/locale/th_TH'
import enUS from 'antd/locale/en_US'
import Root from './Root'
import { LangProvider } from './i18n'
import './global.css'

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

function Themed() {
  const [dark, setDark] = useState(darkQuery.matches)
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches)
    darkQuery.addEventListener('change', onChange)
    return () => darkQuery.removeEventListener('change', onChange)
  }, [])

  return (
    <LangProvider>
      {lang => (
        <ConfigProvider
          locale={lang === 'th' ? thTH : enUS}
          theme={{
            algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
            token: {
              colorPrimary: dark ? '#8b5cf6' : '#6d28d9',
              borderRadius: 8,
              fontFamily:
                "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Thai', 'Sarabun', Roboto, 'Helvetica Neue', Arial, sans-serif",
            },
          }}
        >
          <AntApp>
            <Root />
          </AntApp>
        </ConfigProvider>
      )}
    </LangProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Themed />
  </StrictMode>,
)
