import type { BuildSharePayload, CommunityBuild } from '@/types'

const BASE = import.meta.env.VITE_COMMUNITY_API_BASE

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export interface BuildsQuery {
  weapon?: string
  skill?: string
  source?: 'auto' | 'manual'
  sort?: 'votes' | 'new'
  limit?: number
  offset?: number
}

export function getBuilds(query: BuildsQuery = {}): Promise<CommunityBuild[]> {
  const params = new URLSearchParams()
  if (query.weapon) params.set('weapon', query.weapon)
  if (query.skill)  params.set('skill',  query.skill)
  if (query.source) params.set('source', query.source)
  if (query.sort)   params.set('sort',   query.sort)
  if (query.limit)  params.set('limit',  String(query.limit))
  if (query.offset) params.set('offset', String(query.offset))
  const qs = params.toString()
  return request<CommunityBuild[]>(`/api/builds${qs ? `?${qs}` : ''}`)
}

export function getBuild(id: string): Promise<CommunityBuild> {
  return request<CommunityBuild>(`/api/builds/${id}`)
}

export function postBuild(payload: BuildSharePayload): Promise<{ id: string; url: string }> {
  return request<{ id: string; url: string }>('/api/builds', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function voteBuild(id: string): Promise<{ votes: number }> {
  return request<{ votes: number }>(`/api/builds/${id}/vote`, { method: 'POST' })
}
