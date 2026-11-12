import { useEffect, useState, type ReactNode } from 'react'
import { App, Button, Flex, Layout, Menu, Spin, Typography, theme } from 'antd'
import {
  BranchesOutlined,
  DashboardOutlined,
  ExperimentOutlined,
  HistoryOutlined,
  LogoutOutlined,
  SendOutlined,
  SwapOutlined,
} from '@ant-design/icons'
import { api, setUnauthorizedHandler } from './api'
import Login from './pages/Login'
import OverviewPage from './pages/Overview'
import DestinationsPage from './pages/Destinations'
import RulesPage from './pages/Rules'
import HistoryPage from './pages/History'
import SimulatePage from './pages/Simulate'

type PageKey = 'overview' | 'destinations' | 'rules' | 'history' | 'simulate'

const PAGES: { key: PageKey; label: string; icon: ReactNode; render: () => ReactNode }[] = [
  { key: 'overview', label: 'ภาพรวม', icon: <DashboardOutlined />, render: () => <OverviewPage /> },
  { key: 'destinations', label: 'ปลายทาง', icon: <SendOutlined />, render: () => <DestinationsPage /> },
  { key: 'rules', label: 'กฎ', icon: <BranchesOutlined />, render: () => <RulesPage /> },
  { key: 'history', label: 'ประวัติ', icon: <HistoryOutlined />, render: () => <HistoryPage /> },
  { key: 'simulate', label: 'ทดลอง', icon: <ExperimentOutlined />, render: () => <SimulatePage /> },
]

const pageFromHash = (): PageKey => {
  const key = window.location.hash.slice(1)
  return (PAGES.find(p => p.key === key)?.key ?? 'overview') as PageKey
}

export default function Root({ dark }: { dark: boolean }) {
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
  return <Shell user={user} dark={dark} onLogout={() => setAuth('out')} />
}

function Shell({ user, dark, onLogout }: { user: string; dark: boolean; onLogout: () => void }) {
  const { token } = theme.useToken()
  const { message } = App.useApp()
  const [page, setPage] = useState<PageKey>(pageFromHash)

  useEffect(() => {
    const onHash = () => setPage(pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const logout = async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {})
    message.success('ออกจากระบบแล้ว')
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
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          paddingInline: 16,
          background: token.colorBgContainer,
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
        }}
      >
        <Flex align="center" gap={8} style={{ flexShrink: 0 }}>
          <SwapOutlined style={{ fontSize: 20, color: token.colorPrimary }} />
          <Typography.Text strong style={{ fontSize: 16, whiteSpace: 'nowrap' }}>
            Webhook Router
          </Typography.Text>
        </Flex>
        <Menu
          mode="horizontal"
          theme={dark ? 'dark' : 'light'}
          selectedKeys={[page]}
          onClick={e => {
            window.location.hash = e.key
          }}
          items={PAGES.map(p => ({ key: p.key, label: p.label, icon: p.icon }))}
          style={{ flex: 1, minWidth: 0, borderBottom: 'none', background: 'transparent' }}
        />
        <Flex align="center" gap={8} style={{ flexShrink: 0 }}>
          <Typography.Text type="secondary" className="hide-mobile">
            {user}
          </Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={logout} title="ออกจากระบบ" />
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
