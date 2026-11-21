import * as T from 'three';
import { ANCHORS, anchorPoint, mulberry32, Web } from './web';

export function makeGarden(canvas: HTMLCanvasElement, web: Web) {
  const renderer = new T.WebGLRenderer({canvas, antialias: true, alpha: true, powerPreference: 'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const scene = new T.Scene();
  const camera = new T.OrthographicCamera(-1, 1, 1, -1, .01, 15);
  camera.position.set(0, 0, 4);
  const sun = new T.DirectionalLight(0xffdd99, 3);
  sun.position.set(-1, 2, 2);
  scene.add(sun, new T.HemisphereLight(0xffebc7, 0x5b876b, 1.7));
  const rim = new T.DirectionalLight(0xafffdc, 1.2);
  rim.position.set(2, 1, -.2);
  scene.add(rim);

  const random = mulberry32(411);
  // Paint the distant, defocused canopy once. It needs no depth-of-field render pass.
  const backdrop = document.createElement('canvas');
  backdrop.width = 1024; backdrop.height = 1024;
  const ctx = backdrop.getContext('2d')!;
  const gradient = ctx.createRadialGradient(770, 285, 0, 610, 500, 810);
  gradient.addColorStop(0, '#b3a275'); gradient.addColorStop(.25, '#657657');
  gradient.addColorStop(.59, '#324d3c'); gradient.addColorStop(1, '#102a22');
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 230; i++) {
    const x = random()*1100, y = random()*1040, r = 3 + random()**2*75;
    const glow = ctx.createRadialGradient(x,y,0,x,y,r);
    const rgb = random() > .38 ? '252,223,154' : '18,47,39';
    const opacity = .06 + random()*.14;
    glow.addColorStop(0, 'rgba('+rgb+','+opacity+')');
    glow.addColorStop(.72, 'rgba('+rgb+','+opacity+')');
    glow.addColorStop(1, 'rgba('+rgb+',0)');
    ctx.fillStyle=glow; ctx.fillRect(x-r,y-r,2*r,2*r);
  }
  const texture = new T.CanvasTexture(backdrop);
  texture.colorSpace = T.SRGBColorSpace;
  scene.background = texture;
  const wood = new T.MeshStandardMaterial({color: '#554638', roughness: .92});
  const leaf = new T.MeshStandardMaterial({color: '#506b41', side: T.DoubleSide, roughness: .82});
  const leafShape = new T.Shape();
  leafShape.moveTo(0,0); leafShape.quadraticCurveTo(.12,.09,.03,.32);
  leafShape.quadraticCurveTo(-.14,.17,0,0);
  const blade = new T.ShapeGeometry(leafShape,8);
  for (let i=0; i<ANCHORS.length; i++) {
    const [x,y,z] = anchorPoint(i);
    const points = [new T.Vector3(x,y,z-.025),new T.Vector3(x*1.1+.05,y*1.07,z-.05),
      new T.Vector3(x*1.4-.06,y*1.24+.12,z-.11),new T.Vector3(x*1.9,y*1.7+.18,z-.25)];
    const twig = new T.CatmullRomCurve3(points);
    scene.add(new T.Mesh(new T.TubeGeometry(twig,12,.024+i%3*.008,7,false),wood));
    for(let j=0;j<8;j++){
      const sprig = new T.Mesh(blade,leaf);
      sprig.position.copy(twig.getPoint(j/10+.08)); sprig.rotation.set(random(),random(),random()*6);
      sprig.scale.setScalar(.4+random()*.8); scene.add(sprig);
    }
  }

  const geo = new T.BufferGeometry();
  const positions = new Float32Array(web.segments.length * 6);
  const colors = new Float32Array(positions.length);
  web.segments.forEach((edge,i)=>{
    const color = new T.Color().setHSL(.115 + random()*.03, .14 + random()*.16, .65 + random()*.24);
    color.toArray(colors,i*6); color.toArray(colors,i*6+3);
  });
  const attribute = new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage);
  geo.setAttribute('position',attribute); geo.setAttribute('color',new T.BufferAttribute(colors,3));
  const silk = new T.LineSegments(geo,new T.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.66}));
  silk.frustumCulled=false; scene.add(silk);

  const drops = web.spiral.filter(()=>random()<.59).map(index=>({edge:web.segments[index],t:random(),r:.002+random()**3*.009}));
  const beads = new T.InstancedMesh(new T.SphereGeometry(1,7,6),new T.MeshPhongMaterial({color:0xf4edcf,emissive:0x333827,shininess:100}),drops.length);
  beads.frustumCulled=false; scene.add(beads);
  const tmp = new T.Object3D(), a = new T.Vector3(), b = new T.Vector3();
  function node(id:number,out:T.Vector3){return out.fromArray(web.position,id*3);}
  function render() {
    web.segments.forEach((edge,i)=>{
      node(edge.a,a).toArray(positions,i*6);
      node(edge.alive ? edge.b : edge.a,b).toArray(positions,i*6+3);
    });
    attribute.needsUpdate=true;
    drops.forEach(({edge,t,r},i)=>{
      tmp.position.copy(node(edge.a,a)).lerp(node(edge.b,b),t); tmp.position.z+=r*.5;
      tmp.scale.set(r,r*1.12,r);tmp.updateMatrix();beads.setMatrixAt(i,tmp.matrix);
    });
    beads.instanceMatrix.needsUpdate=true;
    renderer.render(scene,camera);
  }
  function resize(intro:boolean){
    const w=canvas.clientWidth,h=canvas.clientHeight,aspect=w/h;
    const height=Math.max(2.95, 2.85/aspect);
    camera.left=-height*aspect/2;camera.right=-camera.left;
    camera.top=height/2;camera.bottom=-camera.top;
    camera.position.set(intro && aspect>1.5 ? -height*aspect*.16 : 0,intro && aspect<=1.5 ? -height*.12 : 0,4);
    camera.updateProjectionMatrix();camera.updateMatrixWorld();renderer.setSize(w,h,false);
  }
  function screen(point:T.Vector3){
    a.copy(point).project(camera); return {x:(a.x+1)*canvas.clientWidth/2,y:(1-a.y)*canvas.clientHeight/2};
  }
  function pick(x:number,y:number){
    const pos=new T.Vector3(x/canvas.clientWidth*2-1,1-y/canvas.clientHeight*2,0).unproject(camera);
    let best=-1, distance=.22**2;
    for(let i=0;i<web.count;i++){
      if(web.pinned[i]) continue;
      node(i,a); const d=(a.x-pos.x)**2+(a.y-pos.y)**2;
      if(d<distance){best=i;distance=d;}
    }
    return best;
  }
  return {scene,render,resize,screen,pick,node};
}

export function createMoth(){
  const moth = new T.Group();
  const bronze=new T.MeshStandardMaterial({color:0xb37735,roughness:.64});
  const body=new T.Mesh(new T.SphereGeometry(1,12,10),bronze);
  body.scale.set(.013,.044,.013); moth.add(body);
  const shape=new T.Shape();shape.moveTo(0,.02);shape.quadraticCurveTo(.037,.067,.078,.053);
  shape.quadraticCurveTo(.07,.015,.023,-.023);shape.quadraticCurveTo(.068,-.04,.034,-.058);shape.quadraticCurveTo(.009,-.055,0,0);
  const geom=new T.ShapeGeometry(shape,10);
  const ivory=new T.MeshStandardMaterial({color:0xffdf9b,emissive:0x61451b,side:T.DoubleSide});
  const wings=[-1,1].map(side=>{
    const wing=new T.Mesh(geom,ivory);wing.scale.x=side;moth.add(wing);
    const spot=new T.Mesh(new T.CircleGeometry(.009,12),bronze);spot.position.set(.046,.032,.001);wing.add(spot);
    return wing;
  });
  return {object:moth,flutter(t:number){wings.forEach((w,i)=>w.rotation.y=(i?1:-1)*(.36+Math.sin(t*24)*.34));}};
}
