export type LolaCatalog = {
  dataSetId: string
  name: string
  startTime: string
  stopTime: string
  releaseDate: string
}

export type SpiceLunarSubpoint = {
  epoch: string
  longitudeDeg: number
  latitudeDeg: number
  radiusKm: number
  observerDistanceKm: number
  kernelSetId: string
}

type SpiceKernelSetResponse = {
  status?: string
  items?: {
    kernelSetId?: number | string
    missionId?: string
    description?: string
  }[]
}

type SpiceCalculationResponse = {
  status?: string
  message?: string
  calculationId?: string
  result?: { phase?: string }
}

type SpiceCalculationStatus = {
  status?: string
  message?: string
  result?: { phase?: string }
}

type SpiceCalculationResults = {
  status?: string
  message?: string
  columns?: { outputID?: string }[]
  rows?: unknown[][]
}

const lolaCatalogUrl = 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/catalog/gdr_ds.cat'
const spiceApiDocumentationUrl = 'https://wgc2.jpl.nasa.gov:8443/webgeocalc/documents/api-info.html'
const lroKernelSetIdPattern = /\bto\s+(\d{4}-\d{2}-\d{2})\b/i

function requireSuccessfulResponse(response: Response, serviceName: string) {
  if (!response.ok) {
    throw new Error(`${serviceName} returned HTTP ${response.status}.`)
  }
}

function requireApiSuccess(status: string | undefined, message: string | undefined, serviceName: string) {
  if (status !== 'OK') {
    throw new Error(message || `${serviceName} did not return a successful response.`)
  }
}

function parseCatalogField(text: string, field: string) {
  const match = text.match(new RegExp(`^\\s*${field}\\s*=\\s*(?:"([^"]+)"|([^\\r\\n]+))`, 'm'))
  const value = match?.[1] ?? match?.[2]?.trim()
  if (!value) throw new Error(`The NASA LOLA catalog did not include ${field}.`)
  return value
}

export function parseLolaCatalog(text: string): LolaCatalog {
  return {
    dataSetId: parseCatalogField(text, 'DATA_SET_ID'),
    name: parseCatalogField(text, 'DATA_SET_NAME'),
    startTime: parseCatalogField(text, 'START_TIME'),
    stopTime: parseCatalogField(text, 'STOP_TIME'),
    releaseDate: parseCatalogField(text, 'DATA_SET_RELEASE_DATE'),
  }
}

export async function fetchLolaCatalog(signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const response = await fetcher('/api/nasa/pds/lola-gdr-catalog', { signal })
  requireSuccessfulResponse(response, 'NASA PDS LOLA catalog')
  return parseLolaCatalog(await response.text())
}

function getLroKernelSet(kernelSets: SpiceKernelSetResponse['items']) {
  const lroKernelSet = kernelSets?.find((kernelSet) => kernelSet.missionId === 'lro')
  if (!lroKernelSet?.kernelSetId || !lroKernelSet.description) {
    throw new Error('The NASA SPICE service did not list an LRO kernel set with coverage details.')
  }

  const coverageEnd = lroKernelSet.description.match(lroKernelSetIdPattern)?.[1]
  if (!coverageEnd) throw new Error('The NASA SPICE LRO kernel-set coverage end date could not be read.')

  return { id: String(lroKernelSet.kernelSetId), coverageEnd }
}

function getEpochBeforeCoverageEnd(coverageEnd: string) {
  const epochDate = new Date(`${coverageEnd}T00:00:00.000Z`)
  if (Number.isNaN(epochDate.getTime())) throw new Error('The NASA SPICE LRO kernel coverage date is invalid.')
  epochDate.setUTCDate(epochDate.getUTCDate() - 1)
  epochDate.setUTCHours(12, 0, 0, 0)
  return epochDate.toISOString().replace('.000Z', '')
}

function waitForNextPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', handleAbort)
      resolve()
    }, 1000)
    const handleAbort = () => {
      window.clearTimeout(timer)
      reject(new DOMException('The SPICE request was cancelled.', 'AbortError'))
    }
    if (signal.aborted) handleAbort()
    else signal.addEventListener('abort', handleAbort, { once: true })
  })
}

function numericValue(row: unknown[], columns: SpiceCalculationResults['columns'], outputId: string) {
  const columnIndex = columns?.findIndex((column) => column.outputID === outputId) ?? -1
  const value = columnIndex >= 0 ? Number(row[columnIndex]) : Number.NaN
  if (!Number.isFinite(value)) throw new Error(`The NASA SPICE result did not include a valid ${outputId} measurement.`)
  return value
}

export async function fetchLroLunarSubpoint(signal: AbortSignal, fetcher: typeof fetch = fetch) {
  const kernelSetsResponse = await fetcher('/api/nasa/spice/kernel-sets', { signal })
  requireSuccessfulResponse(kernelSetsResponse, 'NASA SPICE kernel-set service')
  const kernelSets = await kernelSetsResponse.json() as SpiceKernelSetResponse
  requireApiSuccess(kernelSets.status, undefined, 'NASA SPICE kernel-set service')
  const kernelSet = getLroKernelSet(kernelSets.items)
  const epoch = getEpochBeforeCoverageEnd(kernelSet.coverageEnd)

  const calculationResponse = await fetcher('/api/nasa/spice/calculation/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      calculationType: 'SUB_OBSERVER_POINT',
      kernels: [{ type: 'KERNEL_SET', id: kernelSet.id }],
      timeSystem: 'UTC',
      timeFormat: 'CALENDAR',
      times: [epoch],
      target: 'MOON',
      targetFrame: 'MOON_ME',
      observer: 'LRO',
      subPointType: 'Near point: ellipsoid',
      aberrationCorrection: 'NONE',
      stateRepresentation: 'LATITUDINAL',
    }),
  })
  requireSuccessfulResponse(calculationResponse, 'NASA SPICE calculation service')
  const calculation = await calculationResponse.json() as SpiceCalculationResponse
  requireApiSuccess(calculation.status, calculation.message, 'NASA SPICE calculation service')
  if (!calculation.calculationId) throw new Error('NASA SPICE did not return a calculation identifier.')

  let phase = calculation.result?.phase
  for (let attempt = 0; phase !== 'COMPLETE' && attempt < 30; attempt += 1) {
    if (phase === 'ERROR' || phase === 'FAILED') {
      throw new Error('NASA SPICE could not calculate the LRO lunar subpoint.')
    }
    await waitForNextPoll(signal)
    const statusResponse = await fetcher(`/api/nasa/spice/calculation/${encodeURIComponent(calculation.calculationId)}`, { signal })
    requireSuccessfulResponse(statusResponse, 'NASA SPICE calculation status')
    const status = await statusResponse.json() as SpiceCalculationStatus
    requireApiSuccess(status.status, status.message, 'NASA SPICE calculation status')
    phase = status.result?.phase
  }

  if (phase !== 'COMPLETE') throw new Error('The NASA SPICE LRO calculation did not finish in time.')

  const resultsResponse = await fetcher(`/api/nasa/spice/calculation/${encodeURIComponent(calculation.calculationId)}/results`, { signal })
  requireSuccessfulResponse(resultsResponse, 'NASA SPICE calculation results')
  const results = await resultsResponse.json() as SpiceCalculationResults
  requireApiSuccess(results.status, results.message, 'NASA SPICE calculation results')
  const row = results.rows?.[0]
  if (!row) throw new Error('NASA SPICE returned no LRO lunar subpoint for the selected epoch.')

  const epochColumn = results.columns?.findIndex((column) => column.outputID === 'DATE') ?? -1
  const resultEpoch = epochColumn >= 0 && typeof row[epochColumn] === 'string'
    ? row[epochColumn]
    : epoch

  return {
    epoch: resultEpoch,
    longitudeDeg: numericValue(row, results.columns, 'LONGITUDE'),
    latitudeDeg: numericValue(row, results.columns, 'LATITUDE'),
    radiusKm: numericValue(row, results.columns, 'SUB_POINT_RADIUS'),
    observerDistanceKm: numericValue(row, results.columns, 'OBSERVER_ALTITUDE'),
    kernelSetId: kernelSet.id,
  } satisfies SpiceLunarSubpoint
}

export const lolaSources = {
  catalog: lolaCatalogUrl,
  dataCollection: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/collection_data_gridded.xml',
  griddedData: 'https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/',
  lroScience: 'https://science.nasa.gov/mission/lro/science-and-data/',
  lolaInstrument: 'https://science.nasa.gov/mission/lro/lola/',
  spice: 'https://wgc2.jpl.nasa.gov:8443/webgeocalc/',
  spiceDocumentation: spiceApiDocumentationUrl,
} as const
