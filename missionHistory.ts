import type { MissionSimulationRun } from './missionSimulationRules'
import { getMissionProgressPercent } from './missionSimulationRules'

const missionHistoryKey = 'mission-frontier-runs-v1'

export type MissionHistoryEntry = {
  id: string
  completedAt: string
  missionName: string
  levelId: string
  levelName: string
  objectiveName: string
  orbitName: string
  vehicleName: string
  spacecraftSystems: string[]
  scienceInstruments: string[]
  resources: {
    massKg: number
    massCapacityKg: number
    levelMassLimitKg: number
    powerDrawW: number
    powerSupplyW: number
    batteryWh: number
    costM: number
    budgetLimitM: number
    dataGbDay: number
    communicationGbDay: number
  }
  progressPercent: number
  result: MissionSimulationRun['result']
}

type MissionStorage = Pick<Storage, 'getItem' | 'setItem'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isNumberRecord(value: unknown, keys: (keyof MissionHistoryEntry['resources'])[]): value is MissionHistoryEntry['resources'] {
  return isRecord(value) && keys.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))
}

function isCheck(value: unknown): value is MissionSimulationRun['result']['checks'][number] {
  if (!isRecord(value)) return false
  return typeof value.label === 'string'
    && typeof value.detail === 'string'
    && typeof value.score === 'number'
    && (value.status === 'pass' || value.status === 'warning' || value.status === 'problem')
}

function isMissionResult(value: unknown): value is MissionSimulationRun['result'] {
  if (!isRecord(value)) return false
  return typeof value.configurationKey === 'string'
    && typeof value.missionName === 'string'
    && typeof value.levelName === 'string'
    && (typeof value.nextLevelName === 'string' || value.nextLevelName === null)
    && typeof value.objectiveName === 'string'
    && (value.outcome === 'Successful' || value.outcome === 'Partially Successful' || value.outcome === 'Requires Redesign')
    && typeof value.levelComplete === 'boolean'
    && typeof value.score === 'number' && Number.isFinite(value.score)
    && typeof value.explanation === 'string'
    && Array.isArray(value.checks) && value.checks.every(isCheck)
    && Array.isArray(value.levelChecks) && value.levelChecks.every(isCheck)
    && isStringArray(value.problems)
    && isStringArray(value.recommendations)
}

function isMissionHistoryEntry(value: unknown): value is MissionHistoryEntry {
  if (!isRecord(value)) return false
  const resourceKeys: (keyof MissionHistoryEntry['resources'])[] = [
    'massKg',
    'massCapacityKg',
    'levelMassLimitKg',
    'powerDrawW',
    'powerSupplyW',
    'batteryWh',
    'costM',
    'budgetLimitM',
    'dataGbDay',
    'communicationGbDay',
  ]

  return typeof value.id === 'string'
    && typeof value.completedAt === 'string'
    && Number.isFinite(Date.parse(value.completedAt))
    && typeof value.missionName === 'string'
    && typeof value.levelId === 'string'
    && typeof value.levelName === 'string'
    && typeof value.objectiveName === 'string'
    && typeof value.orbitName === 'string'
    && typeof value.vehicleName === 'string'
    && isStringArray(value.spacecraftSystems)
    && isStringArray(value.scienceInstruments)
    && isNumberRecord(value.resources, resourceKeys)
    && typeof value.progressPercent === 'number'
    && Number.isFinite(value.progressPercent)
    && value.progressPercent >= 0
    && value.progressPercent <= 100
    && isMissionResult(value.result)
}

function parseMissionHistory(raw: string | null): MissionHistoryEntry[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isMissionHistoryEntry) : []
  } catch (error) {
    console.error('Saved mission history could not be parsed.', error)
    return []
  }
}

function getStorage(storage?: MissionStorage): MissionStorage | null {
  if (storage) return storage
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export function createMissionHistoryEntry(
  run: MissionSimulationRun,
  completedAt = new Date().toISOString(),
): MissionHistoryEntry {
  return {
    id: String(run.runId),
    completedAt,
    missionName: run.missionName,
    levelId: run.levelId,
    levelName: run.levelName,
    objectiveName: run.objectiveName,
    orbitName: run.orbitName,
    vehicleName: run.vehicleName,
    spacecraftSystems: run.components
      .filter((component) => run.selectedComponentIds.includes(component.id))
      .map((component) => component.name),
    scienceInstruments: run.instrumentNames,
    resources: {
      massKg: run.massKg,
      massCapacityKg: run.massCapacityKg,
      levelMassLimitKg: run.levelMassLimitKg,
      powerDrawW: run.powerDrawW,
      powerSupplyW: run.powerSupplyW,
      batteryWh: run.batteryWh,
      costM: run.costM,
      budgetLimitM: run.budgetLimitM,
      dataGbDay: run.dataGbDay,
      communicationGbDay: run.communicationGbDay,
    },
    progressPercent: getMissionProgressPercent(run),
    result: run.result,
  }
}

export function loadMissionHistory(storage?: MissionStorage) {
  try {
    const target = getStorage(storage)
    return target ? parseMissionHistory(target.getItem(missionHistoryKey)) : []
  } catch (error) {
    console.error('Saved mission history could not be loaded.', error)
    return []
  }
}

export function saveMissionHistory(entry: MissionHistoryEntry, storage?: MissionStorage) {
  const target = getStorage(storage)
  if (!target) throw new Error('Browser storage is not available for mission history.')
  const entries = parseMissionHistory(target.getItem(missionHistoryKey))
  const nextEntries = [entry, ...entries.filter((saved) => saved.id !== entry.id)]
  target.setItem(missionHistoryKey, JSON.stringify(nextEntries))
  return nextEntries
}
