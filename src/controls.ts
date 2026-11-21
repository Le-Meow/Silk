type Action = 'silk' | 'pluck' | 'next';
type Callbacks = {
  active(): boolean;
  press(action: Action): void;
  releaseSilk(canceled: boolean): void;
};

export function setupControls(callbacks: Callbacks) {
  const stick = document.getElementById('stick')!;
  const cap = document.getElementById('stick-cap')!;
  const game = document.getElementById('game')!;
  const keyActions: Record<string, Action> = {
    ShiftLeft: 'silk', ShiftRight: 'silk', Space: 'pluck', KeyE: 'next'
  };
  const keys = new Set<string>();
  const fingers = new Map<Action, number>();
  const axes = { x: 0, y: 0 };
  let stickId: number | null = null;
  let touchX = 0, touchY = 0;

  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch') game.dataset.input = 'touch';
  }, {capture:true});

  function syncAction(action: Action, canceled = false) {
    const held = fingers.has(action) || Array.from(keys).some(code => keyActions[code] === action);
    const button = document.getElementById(action)!;
    if (held === button.classList.contains('pressed')) return;
    button.classList.toggle('pressed', held);
    if (held) callbacks.press(action);
    else if (action === 'silk') callbacks.releaseSilk(canceled);
  }

  function sample() {
    const right = keys.has('KeyD') || keys.has('ArrowRight');
    const left = keys.has('KeyA') || keys.has('ArrowLeft');
    const up = keys.has('KeyW') || keys.has('ArrowUp');
    const down = keys.has('KeyS') || keys.has('ArrowDown');
    const x = stickId === null ? Number(right) - Number(left) : touchX;
    const y = stickId === null ? Number(up) - Number(down) : touchY;
    const length = Math.max(1, Math.hypot(x,y));
    axes.x = x / length;
    axes.y = y / length;
    cap.style.transform = 'translate(calc(-50% + '+(axes.x * 32)+'px),calc(-50% - '+(axes.y * 32)+'px))';
    stick.classList.toggle('pressed', stickId !== null || !!(axes.x || axes.y));
  }
  function readPointer(event: PointerEvent) {
    const rect = stick.getBoundingClientRect();
    const radius = rect.width * .35;
    const dx = (event.clientX - rect.left - rect.width / 2) / radius;
    const dy = -(event.clientY - rect.top - rect.height / 2) / radius;
    const distance = Math.hypot(dx,dy);
    const amount = Math.min(1, Math.max(0, (distance - .12) / .88));
    touchX = distance ? dx / distance * amount : 0;
    touchY = distance ? dy / distance * amount : 0;
    sample();
  }
  stick.addEventListener('pointerdown', e => {
    if (!callbacks.active() || stickId !== null || e.button !== 0) return;
    e.preventDefault(); stickId = e.pointerId;
    stick.setPointerCapture(e.pointerId); readPointer(e);
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) readPointer(e); });
  function endStick(e: PointerEvent) {
    if (e.pointerId !== stickId) return;
    stickId = null; touchX = touchY = 0; sample();
  }
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);
  stick.addEventListener('lostpointercapture', endStick);

  for (const action of ['silk','pluck','next'] as Action[]) {
    const button = document.getElementById(action)!;
    button.addEventListener('pointerdown', e => {
      if (!callbacks.active() || fingers.has(action) || e.button !== 0) return;
      e.preventDefault(); fingers.set(action, e.pointerId);
      button.setPointerCapture(e.pointerId); syncAction(action);
    });
    const end = (e: PointerEvent) => {
      if (fingers.get(action) !== e.pointerId) return;
      fingers.delete(action); syncAction(action, e.type !== 'pointerup');
    };
    button.addEventListener('pointerup',end);
    button.addEventListener('pointercancel',end);
    button.addEventListener('lostpointercapture',end);
    button.addEventListener('click', e => {
      if (e.detail || !callbacks.active()) return;
      callbacks.press(action);
      if (action === 'silk') callbacks.releaseSilk(false);
    });
  }
  const moveKeys = new Set(['KeyA','KeyW','KeyS','KeyD','ArrowLeft','ArrowUp','ArrowDown','ArrowRight']);
  window.addEventListener('keydown', e => {
    // Leave Shift+Tab and browser shortcuts available without spending silk.
    if (e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) {
      keys.delete('ShiftLeft');
      keys.delete('ShiftRight');
      syncAction('silk', true);
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const bound = moveKeys.has(e.code) || Boolean(keyActions[e.code]);
    if (bound || ['Tab','Enter','Escape'].includes(e.key)) game.dataset.input = 'keyboard';
    if (!callbacks.active() || !bound) return;
    e.preventDefault(); if (e.repeat || keys.has(e.code)) return;
    keys.add(e.code); sample();
    if (keyActions[e.code]) syncAction(keyActions[e.code]);
  });
  window.addEventListener('keyup', e => {
    if (!keys.delete(e.code)) return;
    sample();
    if (keyActions[e.code]) syncAction(keyActions[e.code], !callbacks.active());
  });
  function reset() {
    keys.clear(); fingers.clear(); stickId = null; touchX = touchY = 0;
    for (const el of document.querySelectorAll('#controller .pressed')) el.classList.remove('pressed');
    sample(); callbacks.releaseSilk(true);
  }
  return { axes, reset };
}
