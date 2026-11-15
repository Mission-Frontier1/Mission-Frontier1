import { useEffect, useState } from 'react'
import { fetchLolaCatalog, fetchLroLunarSubpoint, lolaSources } from './nasaScienceData'
import type { LolaCatalog, SpiceLunarSubpoint } from './nasaScienceData'
import './NasaDataPanel.css'

type MissionDestination = 'earth' | 'moon' | 'mars' | 'deep'

type DestinationSource = {
  bodyId: string | null
  bodyName: string | null
  missionQuery: string
}

type DatasetState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T; retrievedAt: string; sourceUrl: string }
  | { status: 'error'; message: string }
  | { status: 'unavailable'; message: string }

type DestinationDatasetState<T> = {
  destinationId: MissionDestination
  state: DatasetState<T>
}

type PlanetaryFact = {
  bodyName: string
  meanRadiusKm: number
  uncertaintyKm: number | null
}

type NasaImage = {
  title: string
  description: string
  nasaId: string
  recordDate: string | null
  imageUrl: string | null
  credit: string | null
}

type HorizonsResponse = {
  error?: string
  result?: string
}

type NasaImageResponse = {
  collection?: {
    items?: {
      data?: {
        nasa_id?: string
        title?: string
        description?: string
        date_created?: string
        photographer?: string
        secondary_creator?: string
      }[]
      links?: {
        href?: string
        rel?: string
        render?: string
      }[]
    }[]
  }
}

const destinationSources: Record<MissionDestination, DestinationSource> = {
  earth: {
    bodyId: '399',
    bodyName: 'Earth',
    missionQuery: 'Landsat 9 satellite',
  },
  moon: {
    bodyId: '301',
    bodyName: 'Moon',
    missionQuery: 'LRO LOLA lunar topography',
  },
  mars: {
    bodyId: '499',
    bodyName: 'Mars',
    missionQuery: 'Perseverance Mars rover',
  },
  deep: {
    bodyId: null,
    bodyName: null,
    missionQuery: 'Voyager spacecraft NASA',
  },
}

function sourceDate(timestamp: string) {
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(timestamp))
}

function cleanDescription(description: string) {
  return description
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function LoadingState() {
  return <p className="nasa-data-message" role="status">Loading NASA information…</p>
}

function NasaDataPanel({
  destinationId,
  destinationName,
}: {
  destinationId: MissionDestination
  destinationName: string
}) {
  const [planetaryState, setPlanetaryState] = useState<DestinationDatasetState<PlanetaryFact>>({
    destinationId: 'earth',
    state: { status: 'loading' },
  })
  const [missionState, setMissionState] = useState<DestinationDatasetState<NasaImage>>({
    destinationId: 'earth',
    state: { status: 'loading' },
  })
  const [lunarSpiceState, setLunarSpiceState] = useState<DestinationDatasetState<SpiceLunarSubpoint>>({
    destinationId: 'earth',
    state: { status: 'loading' },
  })
  const [lolaCatalogState, setLolaCatalogState] = useState<DestinationDatasetState<LolaCatalog>>({
    destinationId: 'earth',
    state: { status: 'loading' },
  })

  useEffect(() => {
    const controller = new AbortController()
    const destination = destinationSources[destinationId]
    const bodyId = destination.bodyId
    const bodyName = destination.bodyName

    if (destinationId === 'moon') {
      fetchLroLunarSubpoint(controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setLunarSpiceState({
              destinationId,
              state: { status: 'ready', data, retrievedAt: new Date().toISOString(), sourceUrl: lolaSources.spice },
            })
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            const message = error instanceof Error ? error.message : 'The NASA SPICE service returned an unknown error.'
            setLunarSpiceState({
              destinationId,
              state: { status: 'error', message },
            })
          }
        })

      fetchLolaCatalog(controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            setLolaCatalogState({
              destinationId,
              state: { status: 'ready', data, retrievedAt: new Date().toISOString(), sourceUrl: lolaSources.catalog },
            })
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            const message = error instanceof Error ? error.message : 'The NASA PDS service returned an unknown error.'
            setLolaCatalogState({
              destinationId,
              state: { status: 'error', message },
            })
          }
        })
    }

    if (bodyId && bodyName) {
      const params = new URLSearchParams({
        format: 'json',
        COMMAND: `'${bodyId}'`,
        OBJ_DATA: 'YES',
        MAKE_EPHEM: 'NO',
      })
      const sourceUrl = `https://ssd.jpl.nasa.gov/api/horizons.api?${params.toString()}`

      fetch(`/api/nasa/horizons.api?${params.toString()}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error('The JPL Horizons service returned an error.')
          const payload = await response.json() as HorizonsResponse
          if (payload.error || !payload.result) throw new Error('JPL Horizons did not return planetary data.')

          const radius = payload.result.match(
            /Vol\.\s*mean\s*radius(?:\s*\(km\)|,\s*km)?\s*=\s*([~]?\d+(?:\.\d+)?)(?:\s*\+-\s*(\d+(?:\.\d+)?))?/i,
          )
          if (!radius) throw new Error('The returned planetary data did not include a mean radius.')

          return {
            bodyName,
            meanRadiusKm: Number(radius[1].replace('~', '')),
            uncertaintyKm: radius[2] ? Number(radius[2]) : null,
          }
        })
        .then((data) => {
          if (!controller.signal.aborted) {
            setPlanetaryState({
              destinationId,
              state: { status: 'ready', data, retrievedAt: new Date().toISOString(), sourceUrl },
            })
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setPlanetaryState({
              destinationId,
              state: {
                status: 'error',
                message: 'NASA planetary data could not be retrieved. Check your connection and try again later.',
              },
            })
          }
        })
    }

    const imageParams = new URLSearchParams({
      q: destination.missionQuery,
      media_type: 'image',
      page_size: '5',
    })
    const imageSourceUrl = `https://images-api.nasa.gov/search?${imageParams.toString()}`

    fetch(imageSourceUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('The NASA Image and Video Library returned an error.')
        const payload = await response.json() as NasaImageResponse
        const item = payload.collection?.items?.find((candidate) =>
          candidate.data?.[0]?.nasa_id && candidate.data?.[0]?.title,
        )
        const metadata = item?.data?.[0]
        if (!item || !metadata?.nasa_id || !metadata.title) {
          throw new Error('No matching NASA mission media was returned.')
        }

        const imageUrl = item.links?.find((link) =>
          link.render === 'image' && (link.rel === 'preview' || link.rel === 'alternate'),
        )?.href
        const trustedImageUrl = imageUrl?.startsWith('https://images-assets.nasa.gov/') ? imageUrl : null
        const creator = metadata.photographer ?? metadata.secondary_creator

        return {
          title: metadata.title,
          description: cleanDescription(metadata.description ?? ''),
          nasaId: metadata.nasa_id,
          recordDate: metadata.date_created ?? null,
          imageUrl: trustedImageUrl,
          credit: creator ? cleanDescription(creator) : null,
        }
      })
      .then((data) => {
        if (!controller.signal.aborted) {
          const sourceUrl = `https://images.nasa.gov/details/${encodeURIComponent(data.nasaId)}`
          setMissionState({
            destinationId,
            state: { status: 'ready', data, retrievedAt: new Date().toISOString(), sourceUrl },
          })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMissionState({
            destinationId,
            state: {
              status: 'error',
              message: 'NASA mission media could not be retrieved. Check your connection and try again later.',
            },
          })
        }
      })

    return () => controller.abort()
  }, [destinationId])

  const planetaryStatus = planetaryState.destinationId === destinationId
    ? planetaryState.state
    : destinationSources[destinationId].bodyId
      ? { status: 'loading' as const }
      : { status: 'unavailable' as const, message: 'This objective does not identify a specific planetary body, so destination-specific planetary data is unavailable.' }
  const missionStatus = missionState.destinationId === destinationId
    ? missionState.state
    : { status: 'loading' as const }
  const lunarSpiceStatus = lunarSpiceState.destinationId === destinationId
    ? lunarSpiceState.state
    : destinationId === 'moon'
      ? { status: 'loading' as const }
      : { status: 'unavailable' as const, message: 'LRO lunar geometry is only available for the Moon objective.' }
  const lolaCatalogStatus = lolaCatalogState.destinationId === destinationId
    ? lolaCatalogState.state
    : destinationId === 'moon'
      ? { status: 'loading' as const }
      : { status: 'unavailable' as const, message: 'LOLA is a lunar data set and is not applicable to this destination.' }

  return (
    <section className="nasa-data-panel" aria-labelledby="nasa-data-heading">
      <div className="nasa-data-heading">
        <div>
          <span className="builder-kicker">OFFICIAL NASA SOURCES</span>
          <h2 id="nasa-data-heading">NASA Data Information</h2>
          <p>Destination: {destinationName}. Retrieved records link to their official NASA/JPL source.</p>
        </div>
        <span className="nasa-data-badge">VERIFIED NASA DATA</span>
      </div>

      <div className="nasa-data-grid">
        <article className="nasa-data-card">
          <span className="nasa-data-card-label">PLANETARY INFORMATION</span>
          <h3>{destinationSources[destinationId].bodyName ?? 'Destination not specified'}</h3>
          {planetaryStatus.status === 'loading' && <LoadingState />}
          {planetaryStatus.status === 'error' && <p className="nasa-data-message" role="alert">{planetaryStatus.message}</p>}
          {planetaryStatus.status === 'unavailable' && <p className="nasa-data-message">{planetaryStatus.message}</p>}
          {planetaryStatus.status === 'ready' && (
            <>
              <p className="nasa-planet-fact">
                Vol. mean radius: {planetaryStatus.data.meanRadiusKm.toLocaleString('en-US')}
                {planetaryStatus.data.uncertaintyKm !== null
                  ? ` ± ${planetaryStatus.data.uncertaintyKm}`
                  : ''} km
              </p>
              <p className="nasa-source-line">
                Source: <a href={planetaryStatus.sourceUrl} target="_blank" rel="noreferrer">NASA JPL Horizons API</a>
              </p>
              <time className="nasa-retrieved-date" dateTime={planetaryStatus.retrievedAt}>
                Retrieved {sourceDate(planetaryStatus.retrievedAt)}
              </time>
            </>
          )}
        </article>

        <article className="nasa-data-card nasa-mission-card">
          <span className="nasa-data-card-label">MISSION &amp; IMAGE LIBRARY</span>
          {missionStatus.status === 'loading' && <LoadingState />}
          {missionStatus.status === 'error' && <p className="nasa-data-message" role="alert">{missionStatus.message}</p>}
          {missionStatus.status === 'unavailable' && <p className="nasa-data-message">{missionStatus.message}</p>}
          {missionStatus.status === 'ready' && (
            <>
              {missionStatus.data.imageUrl && (
                <a className="nasa-image-link" href={missionStatus.sourceUrl} target="_blank" rel="noopener noreferrer">
                  <img src={missionStatus.data.imageUrl} alt={missionStatus.data.title} loading="lazy" />
                </a>
              )}
              <h3>{missionStatus.data.title}</h3>
              {missionStatus.data.recordDate && (
                <p className="nasa-image-credit">NASA record date: {sourceDate(missionStatus.data.recordDate)}</p>
              )}
              {missionStatus.data.description
                ? <p className="nasa-mission-description">{missionStatus.data.description}</p>
                : <p className="nasa-data-message">NASA has no description for this media item.</p>}
              {missionStatus.data.credit && <p className="nasa-image-credit">Credit: {missionStatus.data.credit}</p>}
              <p className="nasa-source-line">
                Source: <a href={missionStatus.sourceUrl} target="_blank" rel="noopener noreferrer">NASA Image and Video Library</a>
              </p>
              <time className="nasa-retrieved-date" dateTime={missionStatus.retrievedAt}>
                Retrieved {sourceDate(missionStatus.retrievedAt)}
              </time>
            </>
          )}
        </article>
      </div>

      {destinationId === 'moon' && (
        <section className="nasa-lunar-data" aria-labelledby="nasa-lunar-data-heading">
          <div className="nasa-lunar-data-heading">
            <div>
              <span className="nasa-data-card-label">LRO SPICE / PDS LOLA</span>
              <h3 id="nasa-lunar-data-heading">Lunar geometry and topography sources</h3>
            </div>
            <span className="nasa-data-badge">NASA ARCHIVE DATA</span>
          </div>

          <div className="nasa-lunar-data-grid">
            <article className="nasa-data-card">
              <span className="nasa-data-card-label">SPICE-DERIVED LRO SUB-OBSERVER POINT</span>
              {lunarSpiceStatus.status === 'loading' && <LoadingState />}
              {lunarSpiceStatus.status === 'error' && <p className="nasa-data-message" role="alert">{lunarSpiceStatus.message}</p>}
              {lunarSpiceStatus.status === 'unavailable' && <p className="nasa-data-message">{lunarSpiceStatus.message}</p>}
              {lunarSpiceStatus.status === 'ready' && (
                <>
                  <p className="nasa-planet-fact">
                    {lunarSpiceStatus.data.latitudeDeg.toFixed(5)}° latitude · {lunarSpiceStatus.data.longitudeDeg.toFixed(5)}° longitude
                  </p>
                  <p className="nasa-mission-description">Planetocentric sub-observer coordinates on the lunar reference ellipsoid at {lunarSpiceStatus.data.epoch}. SPICE radius: {lunarSpiceStatus.data.radiusKm.toLocaleString('en-US')} km; LRO-to-point distance: {lunarSpiceStatus.data.observerDistanceKm.toFixed(2)} km.</p>
                  <p className="nasa-data-message">This is archived LRO SPICE geometry, not a LOLA terrain-elevation measurement or the simulated mission trajectory.</p>
                  <p className="nasa-source-line">
                    Source: <a href={lunarSpiceStatus.sourceUrl} target="_blank" rel="noreferrer">NASA/JPL NAIF WebGeocalc SPICE</a>
                    {' · '}<a href={lolaSources.spiceDocumentation} target="_blank" rel="noreferrer">API documentation</a>
                  </p>
                  <time className="nasa-retrieved-date" dateTime={lunarSpiceStatus.retrievedAt}>
                    Retrieved {sourceDate(lunarSpiceStatus.retrievedAt)} · LRO kernel set {lunarSpiceStatus.data.kernelSetId}
                  </time>
                </>
              )}
            </article>

            <article className="nasa-data-card">
              <span className="nasa-data-card-label">PDS LOLA GLOBAL DATA RECORD</span>
              {lolaCatalogStatus.status === 'loading' && <LoadingState />}
              {lolaCatalogStatus.status === 'error' && <p className="nasa-data-message" role="alert">{lolaCatalogStatus.message}</p>}
              {lolaCatalogStatus.status === 'unavailable' && <p className="nasa-data-message">{lolaCatalogStatus.message}</p>}
              {lolaCatalogStatus.status === 'ready' && (
                <>
                  <h3>{lolaCatalogStatus.data.name}</h3>
                  <p className="nasa-mission-description">Dataset {lolaCatalogStatus.data.dataSetId}. Archived coverage: {sourceDate(lolaCatalogStatus.data.startTime)} to {sourceDate(lolaCatalogStatus.data.stopTime)}. Released {sourceDate(lolaCatalogStatus.data.releaseDate)}.</p>
                  <p className="nasa-data-message">NASA PDS describes its gridded topography products as digital elevation models, with related slope, roughness, sample-density and reflectance products. The linked archive is the source of terrain measurements; no elevation value is inferred here.</p>
                  <p className="nasa-source-line">
                    Sources: <a href={lolaCatalogStatus.sourceUrl} target="_blank" rel="noreferrer">NASA PDS LOLA GDR catalog</a>
                    {' · '}<a href={lolaSources.dataCollection} target="_blank" rel="noreferrer">PDS gridded-data collection</a>
                    {' · '}<a href={lolaSources.griddedData} target="_blank" rel="noreferrer">LOLA data products</a>
                  </p>
                  <time className="nasa-retrieved-date" dateTime={lolaCatalogStatus.retrievedAt}>
                    Retrieved {sourceDate(lolaCatalogStatus.retrievedAt)}
                  </time>
                </>
              )}
            </article>
          </div>

          <article className="nasa-lola-facts">
            <span className="nasa-data-card-label">NASA LOLA INSTRUMENT MEASUREMENTS</span>
            <p>NASA describes LOLA as a five-beam laser altimeter. In a 50 km polar orbit it pulses at 28 Hz, creating an approximately 50 m swath; the stated equatorial swath separation is 1.25 km, with complete polar coverage beyond ±86° latitude.</p>
            <p className="nasa-data-message">These are published NASA instrument-operation facts, not values used by the game’s resource model or generated simulation.</p>
            <p className="nasa-source-line">
              Source: <a href={lolaSources.lolaInstrument} target="_blank" rel="noreferrer">NASA LRO / LOLA instrument</a>
              {' · '}<a href={lolaSources.lroScience} target="_blank" rel="noreferrer">NASA LRO science and data</a>
            </p>
          </article>
        </section>
      )}

      <p className="nasa-data-disclaimer">
        NASA records above are real NASA archive/API responses. They do not determine spacecraft resources, campaign scores, mission outcomes or the conceptual 3D flight path.
      </p>
    </section>
  )
}

export default NasaDataPanel
