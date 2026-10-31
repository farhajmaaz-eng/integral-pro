const STORE_KEY = 'focus-ledger.v1'

const state = {
  tasks: [],
  sessions: 0,
  minutes: 25,
  remaining: 25 * 60,
  running: false,
  timer: null,
}

const els = {
  timer: document.querySelector('#timer'),
  start: document.querySelector('#start'),
  reset: document.querySelector('#reset'),
  form: document.querySelector('#task-form'),
  input: document.querySelector('#task-input'),
  tasks: document.querySelector('#tasks'),
  count: document.querySelector('#count'),
  sessions: document.querySelector('#sessions'),
  clock: document.querySelector('#clock'),
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    state.tasks = Array.isArray(saved.tasks) ? saved.tasks : []
    state.sessions = Number(saved.sessions) || 0
  } catch {
    state.tasks = []
  }
}

function save() {
  localStorage.setItem(STORE_KEY, JSON.stringify({ tasks: state.tasks, sessions: state.sessions }))
}

function format(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  return `${m}:${s}`
}

function render() {
  els.timer.textContent = format(state.remaining)
  els.count.textContent = state.tasks.filter((task) => !task.done).length
  els.sessions.textContent = `${state.sessions} SESSION${state.sessions === 1 ? '' : 'S'}`
  els.start.textContent = state.running ? 'PAUSE' : 'START'
  els.tasks.replaceChildren(
    ...state.tasks.map((task) => {
      const item = document.createElement('li')
      item.className = task.done ? 'done' : ''
      const check = document.createElement('button')
      check.textContent = task.done ? '[x]' : '[ ]'
      check.setAttribute('aria-label', task.done ? 'Mark incomplete' : 'Mark complete')
      check.addEventListener('click', () => {
        task.done = !task.done
        save()
        render()
      })
      const label = document.createElement('span')
      label.textContent = task.text
      const remove = document.createElement('button')
      remove.textContent = 'DEL'
      remove.setAttribute('aria-label', 'Delete task')
      remove.addEventListener('click', () => {
        state.tasks = state.tasks.filter((itemTask) => itemTask !== task)
        save()
        render()
      })
      item.append(check, label, remove)
      return item
    }),
  )
}

function tick() {
  if (!state.running) return
  state.remaining -= 1
  if (state.remaining <= 0) {
    state.running = false
    state.sessions += 1
    state.remaining = state.minutes * 60
    save()
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Focus session complete')
    }
  }
  render()
}

function start() {
  state.running = !state.running
  if (state.running && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {})
  }
  render()
}

function reset() {
  state.running = false
  state.remaining = state.minutes * 60
  render()
}

els.start.addEventListener('click', start)
els.reset.addEventListener('click', reset)
els.form.addEventListener('submit', (event) => {
  event.preventDefault()
  const text = els.input.value.trim()
  if (!text) return
  state.tasks.push({ text, done: false })
  els.input.value = ''
  save()
  render()
})

document.querySelectorAll('.mode').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach((item) => item.classList.remove('active'))
    button.classList.add('active')
    state.minutes = Number(button.dataset.minutes)
    state.remaining = state.minutes * 60
    state.running = false
    render()
  })
})

function clock() {
  const now = new Date()
  els.clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

load()
render()
clock()
setInterval(clock, 20000)
state.timer = setInterval(tick, 1000)
