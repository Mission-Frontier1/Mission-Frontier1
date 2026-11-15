import { describe, expect, it, vi } from 'vitest'
import { fetchLroLunarSubpoint, parseLolaCatalog } from './nasaScienceData'
import { createMissionHistoryEntry, loadMissionHistory, saveMissionHistory } from './missionHistory'
import type { MissionSimulationRun } from './missionSimulationRules'

const pdsCatalog = `DATA_SET_ID = "LRO-L-LOLA-4-GDR-V1.0"
DATA_SET_NAME = "LRO MOON LASER ALTIMETER 4 GDR V1.0"
START_TIME = 2009-07-13T17:33:17.246
STOP_TIME = 2015-04-16T15:22:08.887
DATA_SET_RELEASE_DATE = 2015-12-15`

function createRun(overrides: Partial<MissionSimulationRun> = {}): MissionSimulationRun {
  const result: MissionSimulationRun['result'] = {
    configurationKey: 'test',
    missionName: 'Moon Exploration',
    levelName: 'Lunar Orbit',
    nextLevelName: null,
    objectiveName: 'Moon Exploration',
    outcome: 'Requires Redesign',
    levelComplete: false,
    score: 40,
    explanation: 'Modeled power requirements fail.',
    checks: [{
      label: 'Power requirements',
      detail: '305 W demand vs 0 W generation.',
      score: 0,
      status: 'problem',
    }],
    levelChecks: [],
    problems: ['Power is insufficient.'],
    recommendations: ['Add power systems.'],
  }

  return {
    runId: 42,
    missionName: 'Moon Exploration',
    levelId: 'lunar-orbit',
    levelName: 'Lunar Orbit',
    objectiveId: 'moon',
    objectiveName: 'Moon Exploration',
    orbitId: 'lunar',
    orbitName: 'Lunar Orbit',
    vehicleName: 'Medium-lift',
    massKg: 300,
    massCapacityKg: 1000,
    levelMassLimitKg: 1000,
    powerDrawW: 305,
    powerSupplyW: 0,
    batteryWh: 4800,
    costM: 518,
    budgetLimitM: 1000,
    dataGbDay: 8,
    communicationGbDay: 12,
    instrumentNames: ['Camera'],
    components: [],
    selectedComponentIds: [],
    result,
    ...overrides,
  }
}

describe('NASA science data provenance', () => {
  it('parses the NASA PDS LOLA catalog and rejects incomplete metadata', () => {
    expect(parseLolaCatalog(pdsCatalog)).toEqual({
      dataSetId: 'LRO-L-LOLA-4-GDR-V1.0',
      name: 'LRO MOON LASER ALTIMETER 4 GDR V1.0',
      startTime: '2009-07-13T17:33:17.246',
      stopTime: '2015-04-16T15:22:08.887',
      releaseDate: '2015-12-15',
    })
    expect(() => parseLolaCatalog('')).toThrow('NASA LOLA catalog')
  })

  it('requests a covered archived LRO epoch and maps SPICE measurements by output ID', async () => {
    const responses = [
      new Response(JSON.stringify({
        status: 'OK',
        items: [{
          kernelSetId: 22,
          missionId: 'lro',
          description: 'Archived LRO kernels covering from 2009-06-18 to 2026-06-15.',
        }],
      })),
      new Response(JSON.stringify({
        status: 'OK',
        calculationId: 'spice-result',
        result: { phase: 'COMPLETE' },
      })),
      new Response(JSON.stringify({
        status: 'OK',
        columns: [
          { outputID: 'DATE' },
          { outputID: 'LATITUDE' },
          { outputID: 'LONGITUDE' },
          { outputID: 'SUB_POINT_RADIUS' },
          { outputID: 'OBSERVER_ALTITUDE' },
        ],
        rows: [['2026-06-14 12:00:00 UTC', 26.9603581, -42.45399432, 1737.4, 70.08403715]],
      })),
    ]
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => responses.shift() as Response)
    const signal = new AbortController().signal

    await expect(fetchLroLunarSubpoint(signal, fetcher)).resolves.toEqual({
      epoch: '2026-06-14 12:00:00 UTC',
      longitudeDeg: -42.45399432,
      latitudeDeg: 26.9603581,
      radiusKm: 1737.4,
      observerDistanceKm: 70.08403715,
      kernelSetId: '22',
    })

    const calculationRequest = fetcher.mock.calls[1][1]
    expect(JSON.parse(String(calculationRequest?.body))).toMatchObject({
      calculationType: 'SUB_OBSERVER_POINT',
      target: 'MOON',
      observer: 'LRO',
      times: ['2026-06-14T12:00:00'],
      kernels: [{ id: '22' }],
    })
  })
})

describe('completed mission history', () => {
  it('persists unsuccessful completed runs with progress, resources, issues, and guidance', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    }
    const entry = createMissionHistoryEntry(createRun(), '2026-11-15T00:00:00.000Z')

    expect(entry.progressPercent).toBe(46)
    expect(entry.result.problems).toContain('Power is insufficient.')
    expect(entry.result.recommendations).toContain('Add power systems.')
    expect(saveMissionHistory(entry, storage)).toEqual([entry])
    expect(loadMissionHistory(storage)).toEqual([entry])
  })
})
