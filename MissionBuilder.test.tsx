// Runtime validation coverage for the exploration campaign.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MissionBuilder from './MissionBuilder'

describe('exploration campaign', () => {
  it('starts at Earth Orbit, locks later levels, and shows each level trajectory', () => {
    const markup = renderToStaticMarkup(
      createElement(MissionBuilder, { activePage: 'Mission Design', missionName: null }),
    )

    expect(markup).toContain('Level 1: Earth Orbit, UNLOCKED')
    expect(markup).toContain('Level 2: Lunar Flyby, LOCKED')
    expect(markup).toContain('Level 3: Lunar Orbit, LOCKED')
    expect(markup).toContain('Level 4: Lunar Landing, LOCKED')
    expect(markup).toContain('Level 5: Mars Exploration, LOCKED')
    expect(markup).toContain('Moon Exploration · Lunar Flyby Trajectory')
    expect(markup).toContain('Moon Exploration · Lunar Orbit')
    expect(markup).toContain('Moon Exploration · Lunar Surface')
  })
})
