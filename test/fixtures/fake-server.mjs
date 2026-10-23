// Pretends to be a Paper server: prints startup logs, answers a few commands, exits on "stop".
import readline from 'node:readline'
const log = (lvl, msg) => console.log(`[12:00:00 ${lvl}]: ${msg}`)
log('INFO', 'Starting minecraft server version 1.21.4')
log('INFO', `Args: ${process.argv.slice(2).join(' ')}`)
setTimeout(() => {
  log('INFO', 'Done (0.123s)! For help, type "help"')
}, 200)
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (line) => {
  const cmd = line.trim()
  if (cmd === 'stop') {
    log('INFO', 'Stopping server')
    setTimeout(() => process.exit(0), 100)
  } else if (cmd === 'list') {
    log('INFO', 'There are 2 of a max of 20 players online: Alex_Builds, Creeper99')
  } else if (cmd === 'join') {
    log('INFO', 'Steve joined the game')
  } else if (cmd === 'crash') {
    log('ERROR', 'Encountered an unexpected exception')
    process.exit(3)
  } else if (cmd === 'save-all flush') {
    log('INFO', 'Saved the game')
  } else {
    log('INFO', `Unknown command: ${cmd}`)
  }
})
