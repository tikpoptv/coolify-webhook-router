export type DestinationType = 'discord' | 'slack' | 'telegram' | 'webhook'

export interface Destination {
  id: number
  name: string
  type: DestinationType
  url: string // masked by the server
  chat_id: string
}

export interface Rule {
  id: number
  project: string
  environment: string
  event: string
  status: '' | 'success' | 'failure'
  destination_id: number
  destination_name: string
  enabled: boolean
}

export interface Delivery {
  id: number
  time: string
  event: string
  project: string
  environment: string
  resource: string
  destination: string
  ok: boolean
  error: string
  payload: string
}

export interface CoolifyStatus {
  configured: boolean
  resources: number
  projects: number
  loaded_at: string
  error: string
}

export interface Overview {
  hook_path: string
  coolify_url: string
  coolify_token_set: boolean
  fallback_destination_id: number
  coolify: CoolifyStatus
}

export interface ProjectInfo {
  name: string
  environments: string[]
}

export interface SimulateResult {
  event: string
  project: string
  environment: string
  resource: string
  destinations: string[]
  fallback: boolean
  sent: boolean
}

export const TYPE_LABELS: Record<DestinationType, string> = {
  discord: 'Discord',
  slack: 'Slack / Mattermost',
  telegram: 'Telegram',
  webhook: 'Webhook',
}

export const TYPE_COLORS: Record<DestinationType, string> = {
  discord: 'geekblue',
  slack: 'purple',
  telegram: 'cyan',
  webhook: 'default',
}

export const EVENTS = [
  'deployment_*', 'deployment_success', 'deployment_failed', 'status_changed', 'restart_limit_reached',
  'backup_*', 'backup_success', 'backup_failed', 'backup_success_with_s3_warning', 'backup_recovered', 'volume_backup_recovered',
  'task_*', 'task_success', 'task_failed', 'task_disabled', 'task_recovered',
  'docker_cleanup_*', 'server_*', 'server_unreachable', 'server_reachable', 'high_disk_usage', 'container_restarted',
  'image_*', 'image_exploited_problem', 'image_vulnerabilities_digest', 'traefik_version_outdated', 'api_token_failing', 'test',
]
