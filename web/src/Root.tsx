import { useEffect, useState, type ReactNode } from 'react'
import { App, Avatar, Button, ConfigProvider, Dropdown, Flex, Layout, Menu, Spin, Typography, theme } from 'antd'
import {
  BranchesOutlined,
  DashboardOutlined,
  DownOutlined,
  ExperimentOutlined,
  HistoryOutlined,
  LogoutOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { api, setUnauthorizedHandler } from './api'
import { useI18n, type MessageKey } from './i18n'
import LangSwitch from './components/LangSwitch'
import Login from './pages/Login'
import OverviewPage from './pages/Overview'
import DestinationsPage from './pages/Destinations'
import RulesPage from './pages/Rules'
import HistoryPage from './pages/History'
import SimulatePage from './pages/Simulate'

type PageKey = 'overview' | 'destinations' | 'rules' | 'history' | 'simulate'

const PAGES: { key: PageKey; label: MessageKey; icon: ReactNode; render: () => ReactNode }[] = [
  { key: 'overview', label: 'nav.overview', icon: <DashboardOutlined />, render: () => <OverviewPage /> },
  { key: 'destinations', label: 'nav.destinations', icon: <SendOutlined />, render: () => <DestinationsPage /> },
  { key: 'rules', label: 'nav.rules', icon: <BranchesOutlined />, render: () => <RulesPage /> },
  { key: 'history', label: 'nav.history', icon: <HistoryOutlined />, render: () => <HistoryPage /> },
  { key: 'simulate', label: 'nav.simulate', icon: <ExperimentOutlined />, render: () => <SimulatePage /> },
]

const pageFromHash = (): PageKey => {
  const key = window.location.hash.slice(1)
  return (PAGES.find(p => p.key === key)?.key ?? 'overview') as PageKey
}

export default function Root() {
  const [auth, setAuth] = useState<'loading' | 'out' | 'in'>('loading')
  const [user, setUser] = useState('')

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth('out'))
    api<{ user: string }>('/api/me')
      .then(me => {
        setUser(me.user)
        setAuth('in')
      })
      .catch(() => setAuth('out'))
  }, [])

  if (auth === 'loading') {
    return (
      <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
        <Spin size="large" />
      </Flex>
    )
  }
  if (auth === 'out') {
    return (
      <Login
        onLogin={u => {
          setUser(u)
          setAuth('in')
        }}
      />
    )
  }
  return <Shell user={user} onLogout={() => setAuth('out')} />
}

function Shell({ user, onLogout }: { user: string; onLogout: () => void }) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const { t } = useI18n()
  const [page, setPage] = useState<PageKey>(pageFromHash)

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const logout = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    message.success(t('shell.loggedOut'))
    onLogout()
  }

  const current = PAGES.find(p => p.key === page)!

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          height: 64,
          lineHeight: 'normal',
          paddingInline: 0,
          background: `color-mix(in srgb, ${token.colorBgContainer} 82%, transparent)`,
          backdropFilter: 'saturate(180%) blur(12px)',
          WebkitBackdropFilter: 'saturate(180%) blur(12px)',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Flex align="center" gap={16} className="nav-inner">
          <a href="#overview" className="brand">
            <span
              className="brand-mark"
              style={{ background: `linear-gradient(135deg, ${token.colorPrimary}, ${token['purple-4']})` }}
            >
              <SwapOutlined />
            </span>
            <span className="brand-text">
              <Typography.Text strong style={{ fontSize: 15, lineHeight: 1.2 }}>
                Webhook Router
              </Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 11, lineHeight: 1.2 }}>
                for Coolify
              </Typography.Text>
            </span>
          </a>

          <ConfigProvider
            theme={{
              components: {
                Menu: {
                  itemBg: 'transparent',
                  horizontalLineHeight: '62px',
                  activeBarHeight: 2,
                  itemPaddingInline: 14,
                  horizontalItemSelectedColor: token.colorPrimary,
                  horizontalItemHoverColor: token.colorText,
                  itemColor: token.colorTextSecondary,
                },
              },
            }}
          >
            <Menu
              mode="horizontal"
              selectedKeys={[page]}
              onClick={e => {
                window.location.hash = e.key
              }}
              items={PAGES.map(p => ({ key: p.key, label: t(p.label), icon: p.icon }))}
              style={{ flex: 1, minWidth: 0, alignSelf: 'stretch', height: 63, lineHeight: '61px', borderBottom: 'none' }}
            />
          </ConfigProvider>

          <LangSwitch />
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{
              items: [
                { key: 'user', label: t('shell.signedInAs', { user }), disabled: true },
                { type: 'divider' },
                { key: 'logout', label: t('shell.logout'), icon: <LogoutOutlined />, danger: true, onClick: logout },
              ],
            }}
          >
            <Button type="text" style={{ height: 40, paddingInline: 6, flexShrink: 0 }}>
              <Flex align="center" gap={8}>
                <Avatar size={28} style={{ background: token.colorPrimaryBg, color: token.colorPrimary, fontWeight: 600 }}>
                  {user.charAt(0).toUpperCase()}
                </Avatar>
                <span className="hide-mobile">{user}</span>
                <DownOutlined style={{ fontSize: 10, color: token.colorTextTertiary }} />
              </Flex>
            </Button>
          </Dropdown>
        </Flex>
      </Layout.Header>
      <Layout.Content>
        <div className="page" key={current.key}>
          {current.render()}
        </div>
      </Layout.Content>
    </Layout>
  )
}
