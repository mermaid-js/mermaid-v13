/** Pure evidence readers; neither runs a renderer nor decides performance fit. */
export function svgCounts(svg) {
  let elements = 0,
    attributes = 0,
    at = 0;
  while ((at = svg.indexOf('<', at)) !== -1) {
    if (svg.startsWith('<!--', at)) {
      const end = svg.indexOf('-->', at + 4);
      if (end < 0) throw new Error('Unclosed SVG comment');
      at = end + 3;
      continue;
    }
    if (svg.startsWith('<![CDATA[', at)) {
      const end = svg.indexOf(']]>', at + 9);
      if (end < 0) throw new Error('Unclosed SVG CDATA');
      at = end + 3;
      continue;
    }
    const start = at++;
    let quote = '';
    while (at < svg.length) {
      const char = svg[at++];
      if (quote) {
        if (char === quote) quote = '';
      } else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (quote || svg[at - 1] !== '>') throw new Error('Unclosed SVG tag');
    const tag = svg.slice(start, at);
    if (/^<[A-Za-z_]/.test(tag)) {
      elements++;
      attributes += [...tag.matchAll(/\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*')/g)].length;
    }
  }
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<svg\b/.test(svg)) throw new Error('Missing SVG root');
  return { outputBytes: Buffer.byteLength(svg), elements, attributes };
}

export function allocationEstimate(profile, boundary) {
  if (!profile?.head || !Array.isArray(profile.samples))
    throw new Error('Missing V8 allocation profile');
  const ids = new Set();
  let bytes = 0;
  const visit = (node, inside) => {
    inside ||= node.callFrame.functionName === boundary;
    if (inside) {
      ids.add(node.id);
      bytes += node.selfSize;
    }
    for (const child of node.children) visit(child, inside);
  };
  visit(profile.head, false);
  const samples = profile.samples.filter((sample) => ids.has(sample.nodeId));
  if (ids.size === 0 || !Number.isFinite(bytes) || bytes <= 0 || samples.length === 0)
    throw new Error(`No sampled allocations under ${boundary}; evidence is insufficient`);
  return { estimatedBytes: bytes, samples: samples.length, scope: boundary };
}

export function parseGcTrace(text) {
  let batch = false,
    forced = false,
    active;
  let starts = 0,
    ends = 0,
    finalCollections = 0;
  const renders = new Map();
  const aggregate = {
    scavengePauseMs: 0,
    scavengeEvents: 0,
    otherGcPauseMs: 0,
    otherGcEvents: 0,
    boundaryGcPauseMs: 0,
    outsideRenderGcPauseMs: 0,
    intervalOccupancyAllocatedBytes: 0,
    intervalOccupancyEvents: 0,
  };
  for (const line of text.split('\n')) {
    if (line.startsWith('PERF_DIAGNOSTIC ')) {
      const event = JSON.parse(line.slice('PERF_DIAGNOSTIC '.length));
      if (event.phase === 'batch-start') {
        if (batch || starts++) throw new Error('Repeated GC batch start');
        batch = true;
      } else if (event.phase === 'render-start') {
        if (!batch || active || forced) throw new Error('Invalid GC render start');
        const key = `${event.repetition}:${event.index}`;
        if (renders.has(key)) throw new Error('Duplicate GC render');
        active = {
          index: event.index,
          repetition: event.repetition,
          scavengePauseMs: 0,
          scavengeEvents: 0,
          otherGcPauseMs: 0,
          otherGcEvents: 0,
        };
        renders.set(key, active);
      } else if (event.phase === 'render-end') {
        if (!active || active.index !== event.index || active.repetition !== event.repetition)
          throw new Error('Mismatched GC render end');
        active = undefined;
      } else if (event.phase === 'batch-force-end') {
        if (!batch || active) throw new Error('Invalid final GC boundary');
        forced = true;
      } else if (event.phase === 'batch-end') {
        if (!batch || !forced || active) throw new Error('Invalid GC batch end');
        batch = false;
        ends++;
      } else throw new Error('Unknown GC marker');
      continue;
    }
    if (!batch || !/\bgc=/.test(line)) continue;
    const fields = Object.fromEntries(
      [...line.matchAll(/(?:^|\s)([a-zA-Z_][a-zA-Z0-9_.]*)=([^\s]+)/g)].map((match) => [
        match[1],
        match[2],
      ])
    );
    const pause = Number(fields.pause),
      allocated = Number(fields.allocated);
    if (
      !['s', 'mc', 'mms'].includes(fields.gc) ||
      !Number.isFinite(pause) ||
      pause < 0 ||
      !Number.isSafeInteger(allocated) ||
      allocated < 0
    )
      throw new Error('Unsupported or invalid pinned V8 GC trace');
    aggregate.intervalOccupancyAllocatedBytes += allocated;
    aggregate.intervalOccupancyEvents++;
    if (forced) {
      aggregate.boundaryGcPauseMs += pause;
      finalCollections++;
    } else if (active) {
      const prefix = fields.gc === 's' ? 'scavenge' : 'otherGc';
      active[`${prefix}PauseMs`] += pause;
      active[`${prefix}Events`]++;
      aggregate[`${prefix}PauseMs`] += pause;
      aggregate[`${prefix}Events`]++;
    } else aggregate.outsideRenderGcPauseMs += pause;
  }
  if (batch || active || starts !== 1 || ends !== 1 || finalCollections < 1 || renders.size === 0)
    throw new Error('Incomplete GC boundary/render evidence');
  return {
    ...aggregate,
    pauseRoundingErrorMs: 0.05 * (aggregate.scavengeEvents + aggregate.otherGcEvents),
    renders: [...renders.values()],
  };
}
