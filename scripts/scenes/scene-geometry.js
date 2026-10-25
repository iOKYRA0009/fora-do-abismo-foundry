/** Structural checks for wall coordinates expressed in grid units. */
export function inspectWallGeometry(walls = [], columns, rows) {
  const errors = [];
  const warnings = [];
  const seen = new Map();
  const width = Number(columns);
  const height = Number(rows);

  walls.forEach((wall, index) => {
    const a = wall?.a;
    const b = wall?.b;
    if (!validPoint(a) || !validPoint(b)) return;
    const path = `walls[${index}]`;
    if (a[0] === b[0] && a[1] === b[1]) {
      errors.push(`${path} tem comprimento zero.`);
      return;
    }
    if (Number.isFinite(width) && Number.isFinite(height)
      && [a, b].some(([x, y]) => x < 0 || y < 0 || x > width || y > height)) {
      errors.push(`${path} sai dos limites da Scene ${width}x${height}.`);
    }

    const pointKey = p => `${Number(p[0]).toFixed(4)},${Number(p[1]).toFixed(4)}`;
    const key = [pointKey(a), pointKey(b)].sort().join("|");
    if (seen.has(key)) {
      warnings.push(`${path} coincide com walls[${seen.get(key)}]; revise parede/porta sobreposta.`);
    } else seen.set(key, index);
  });

  return { errors, warnings };
}

function validPoint(value) {
  return Array.isArray(value) && value.length === 2
    && value.every(number => Number.isFinite(Number(number)));
}
