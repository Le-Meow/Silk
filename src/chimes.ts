// A quiet plucked string. The distance between anchors sets its note.
export function createChimes() {
  let context: AudioContext | undefined;
  let muted = false;
  try { muted = localStorage.getItem('silk.quiet') === 'yes'; } catch {}
  function unlock() {
    if(muted)return;
    try {
      context ??= new AudioContext();
      if(context.state==='suspended')void context.resume().catch(()=>{});
    } catch {}
  }
  function play(note: number, loop = false) {
    if(muted || context?.state!=='running')return;
    const scale = [220,246.94,293.66,329.63,392,440];
    const pitches = loop ? [1,1.25,1.5] : [1];
    pitches.forEach((ratio,i) => {
      const ctx=context!, osc=ctx.createOscillator(), gain=ctx.createGain();
      const at=ctx.currentTime+.015+i*.12;
      osc.type='sine';osc.frequency.value=scale[Math.abs(note)%scale.length]*ratio;
      gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.064,at+.014);
      gain.gain.exponentialRampToValueAtTime(.0001,at+1);
      osc.connect(gain);gain.connect(ctx.destination);
      osc.onended=()=>{osc.disconnect();gain.disconnect();};osc.start(at);osc.stop(at+1.02);
    });
  }
  function toggle(){
    muted=!muted;
    try{localStorage.setItem('silk.quiet',muted?'yes':'no');}catch{}
    if(muted && context?.state==='running')void context.suspend().catch(()=>{});
    else unlock();
  }
  return {unlock,play,toggle,get muted(){return muted;}};
}
