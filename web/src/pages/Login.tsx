import { useState } from 'react'
import { Alert, Button, Card, Flex, Form, Input, Typography, theme } from 'antd'
import { LockOutlined, SwapOutlined, UserOutlined } from '@ant-design/icons'
import { api, errorText } from '../api'
import { useI18n } from '../i18n'
import LangSwitch from '../components/LangSwitch'

export default function Login({ onLogin }: { onLogin: (user: string) => void }) {
  const { token } = theme.useToken()
  const { t } = useI18n()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (values: { username: string; password: string }) => {
    setLoading(true)
    setError('')
    try {
      const me = await api<{ user: string }>('/api/login', { method: 'POST', body: values })
      onLogin(me.user)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh', padding: 16, background: token.colorBgLayout, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <LangSwitch />
      </div>
      <Card style={{ width: '100%', maxWidth: 380 }}>
        <Flex vertical align="center" gap={4} style={{ marginBottom: 24 }}>
          <SwapOutlined style={{ fontSize: 32, color: token.colorPrimary }} />
          <Typography.Title level={4} style={{ margin: 0 }}>
            Webhook Router
          </Typography.Title>
          <Typography.Text type="secondary">{t('login.tagline')}</Typography.Text>
        </Flex>
        {error && <Alert type="error" title={error} showIcon style={{ marginBottom: 16 }} />}
        <Form layout="vertical" onFinish={submit} initialValues={{ username: 'admin' }} requiredMark={false}>
          <Form.Item name="username" label={t('login.username')} rules={[{ required: true, message: t('login.usernameRequired') }]}>
            <Input prefix={<UserOutlined />} autoComplete="username" size="large" />
          </Form.Item>
          <Form.Item name="password" label={t('login.password')} rules={[{ required: true, message: t('login.passwordRequired') }]}>
            <Input.Password prefix={<LockOutlined />} autoComplete="current-password" size="large" autoFocus />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            {t('login.submit')}
          </Button>
        </Form>
      </Card>
    </Flex>
  )
}
