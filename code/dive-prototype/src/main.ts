// Dive Prototype — placeholder render
// Grabs the 2D context and fills the canvas with a solid color to prove
// that the rendering pipeline is wired up. No game logic lives here yet.

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement
const ctx = canvas.getContext('2d')

if (!ctx) {
  throw new Error('Could not get 2D rendering context from canvas')
}

// Placeholder: deep ocean blue — something is rendering.
ctx.fillStyle = '#0d2b4e'
ctx.fillRect(0, 0, canvas.width, canvas.height)

// Label so it's obvious the scaffold is working
ctx.fillStyle = '#7ecef4'
ctx.font = '20px monospace'
ctx.textAlign = 'center'
ctx.fillText('Dive Prototype — scaffold OK', canvas.width / 2, canvas.height / 2)
