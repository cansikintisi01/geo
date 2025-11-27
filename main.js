const CONFIG = {
    moveSpeed: 18, runSpeed: 30,
    gravity: 45, jumpForce: 16,
    friction: 8. 0, airAccel: 25. 0, groundAccel: 80.0,
    chunkSize: 50, renderDist: 2, maxEnemies: 15, 
    dashForce: 85, dashCooldown: 1000, 
    neonSpeed: 0.1,
    regenDelay: 5000, 
    wallBreakSpeed: 70,
    trailEnabled: true,
    trailOpacity: 0.3,
    shockwaveEnabled: true,
    speedLinesEnabled: true
};

const WEAPONS = [
    { name: "RIFLE", color: 0x00ff88, damage: 1, fireRate: 90, spread: 0.02, count: 1, recoil: 0.2 },
    { name: "SHOTGUN", color: 0xffaa00, damage: 1, fireRate: 800, spread: 0.15, count: 8, recoil: 0. 6 }
];

const Textures = {
    floor: null, wall: null,
    init() {
        const c1 = document.createElement('canvas'); c1.width=1024; c1.height=1024;
        const ctx1 = c1.getContext('2d');
        ctx1.fillStyle = '#050505'; ctx1.fillRect(0,0,1024,1024);
        ctx1.strokeStyle = '#1f1f1f'; ctx1. lineWidth = 4;
        ctx1.beginPath();
        for(let i=0; i<=1024; i+=128) { ctx1.moveTo(i,0); ctx1.lineTo(i,1024); ctx1. moveTo(0,i); ctx1.lineTo(1024,i); }
        ctx1.stroke();
        this.floor = new THREE.CanvasTexture(c1);
        this.floor.wrapS = this.floor.wrapT = THREE.RepeatWrapping;

        const c2 = document. createElement('canvas'); c2.width=512; c2.height=512;
        const ctx2 = c2.getContext('2d');
        const grd = ctx2.createLinearGradient(0,0,0,512);
        grd.addColorStop(0, '#222'); grd.addColorStop(1, '#000');
        ctx2.fillStyle = grd; ctx2.fillRect(0,0,512,512);
        ctx2.strokeStyle = '#ff0055'; ctx2.lineWidth = 10;
        ctx2.strokeRect(0,0,512,512);
        ctx2.lineWidth = 2; ctx2.beginPath(); ctx2.moveTo(0,0); ctx2.lineTo(512,512); ctx2.moveTo(512,0); ctx2.lineTo(0,512); ctx2. stroke();
        this.wall = new THREE.CanvasTexture(c2);
    }
};

let scene, camera, renderer, composer, clock;
let player = { 
    pos: new THREE.Vector3(0,5,0), vel: new THREE.Vector3(), 
    hp: 100, score: 0, dead: false, onGround: false,
    baseFov: 90, weaponIdx: 0, lastFire: 0,
    baseHue: 0, lastDash: 0, lastDamageTime: 0 
};
let input = { w:0, a:0, s:0, d:0, space:0, mouseX:0, mouseY:0 };
let camRot = { x: 0, y: 0 };
let cameraShake = 0;

const chunks = new Map();
const colliders = []; 
const wallMeshes = []; 
const enemies = [];
const projectiles = [];
const particles = [];
const floatingTexts = [];
const speedLines = [];
const shockwaves = [];
const motionTrail = [];

let weaponGroup, muzzleLight, weaponBody, weaponRail;
let weaponSway = { x:0, y:0, tilt: 0 };
let recoil = 0;

const AudioCtx = new (window.AudioContext || window. webkitAudioContext)();

function playSound(type) {
    if(AudioCtx. state === 'suspended') AudioCtx.resume();
    const osc = AudioCtx.createOscillator();
    const gain = AudioCtx.createGain();
    const now = AudioCtx.currentTime;

    if(type === 'shoot') {
        osc.frequency.setValueAtTime(player.weaponIdx===0?  800:150, now);
        osc. frequency.exponentialRampToValueAtTime(50, now + 0.15);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.type = player.weaponIdx===0? 'sawtooth':'square';
    } 
    else if(type === 'hit') {
        osc.type = 'triangle';
        osc.frequency. setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(0, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
    }
    else if(type === 'smash') { 
        osc.type = 'square';
        osc.frequency. setValueAtTime(100, now);
        osc. frequency.exponentialRampToValueAtTime(10, now + 0.5);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.5);
    }
    
    osc.connect(gain); gain.connect(AudioCtx. destination);
    osc.start(); osc.stop(now + 0.5);
}

function showFloatingText(text, pos) {
    const div = document.createElement('div');
    div.innerText = text;
    div. style.position = 'absolute';
    div.style.color = '#fff';
    div.style.fontSize = '60px';
    div.style. fontWeight = '900';
    div.style.fontStyle = 'italic';
    div.style.textShadow = '0 0 30px #ff0055, 0 0 60px #00ffff';
    div.style. pointerEvents = 'none';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.left = '50%'; 
    div.style.top = '50%'; 
    document.body.appendChild(div);
    
    const x = window.innerWidth/2 + (Math.random()-0.5)*400;
    const y = window. innerHeight/2 + (Math.random()-0.5)*200;
    div.style.left = x + 'px'; 
    div.style.top = y + 'px';

    setTimeout(() => { 
        div.style.transform = 'scale(2. 5) rotate(45deg)'; 
        div.style.opacity = '0'; 
    }, 50);
    setTimeout(() => div.remove(), 1000);
}

function init() {
    Textures.init();
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.02);
    
    camera = new THREE.PerspectiveCamera(player.baseFov, window.innerWidth/window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window. innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.1; bloomPass.strength = 1.5; bloomPass.radius = 0. 5;
    
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(bloomPass);
    
    clock = new THREE.Clock();
    createWeapon();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth/window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window. innerWidth, window.innerHeight);
    });

    document.addEventListener('mousemove', e => {
        if(document.pointerLockElement && !player.dead) {
            camRot.y -= e.movementX * 0. 002;
            camRot.x -= e.movementY * 0.002;
            camRot.x = Math.max(-1. 5, Math.min(1. 5, camRot.x));
            input.mouseX = e.movementX; input.mouseY = e.movementY;
        }
    });
    document.addEventListener('mousedown', () => { if(! player.dead && document.pointerLockElement) fireWeapon(); });
    document.addEventListener('keydown', e => onKey(e, 1));
    document.addEventListener('keyup', e => onKey(e, 0));
    document.getElementById('start-btn').addEventListener('click', startGame);
}

function startGame() {
    if(player.dead) { location.reload(); return; }
    document.getElementById('menu'). style.display = 'none';
    document.body.requestPointerLock();
    if(AudioCtx.state === 'suspended') AudioCtx.resume();
    player.lastDamageTime = Date.now();
    loop();
}

function createWeapon() {
    weaponGroup = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.2, metalness: 0.9 });
    const matGlow = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

    weaponBody = new THREE.Mesh(new THREE.BoxGeometry(0. 12, 0.18, 0.7), matBody);
    weaponRail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.65), matGlow);
    weaponRail.position.y = 0.1;
    
    weaponGroup.add(weaponBody, weaponRail);
    muzzleLight = new THREE. PointLight(0x00ffff, 0, 15);
    muzzleLight. position.set(0, 0, -0.8);
    weaponGroup.add(muzzleLight);

    weaponGroup.position.set(0. 3, -0.25, -0.5);
    camera.add(weaponGroup);
    scene.add(camera);
}

function updateWeaponVisuals() {
    const w = WEAPONS[player.weaponIdx];
    weaponRail.material.color.setHex(w.color);
    muzzleLight.color.setHex(w.color);
    if(player.weaponIdx === 0) {
        weaponBody.scale.set(1, 1, 1);
        document.getElementById('crosshair').style.cssText = "width:4px; height:4px; border-radius:50%";
    } else {
        weaponBody.scale.set(1.5, 0.8, 0.8);
        document.getElementById('crosshair').style.cssText = "width:20px; height:20px; border-radius:2px";
    }
    document.getElementById('weapon-name').innerText = w.name;
    document.getElementById('weapon-name').style.color = '#' + w.color. toString(16);
}

function updateNeonWorld(dt) {
    player.baseHue += CONFIG.neonSpeed * dt * 50;
    if(player.baseHue > 360) player.baseHue = 0;
    const neonColor = new THREE.Color(`hsl(${player.baseHue}, 80%, 50%)`);
    const fogColor = new THREE.Color(`hsl(${player.baseHue}, 60%, 5%)`); 

    scene.fog.color.lerp(fogColor, 0. 1);
    renderer.setClearColor(scene.fog.color);

    chunks.forEach(chunk => {
        chunk.mesh.children.forEach(child => {
            if(child.material && child.material.emissive) {
                if(child.geometry. type === 'BoxGeometry') child.material.emissive.lerp(neonColor, 0.1);
            }
        });
    });
    
    document.getElementById('hp-fill').style.boxShadow = `0 0 15px #${neonColor.getHexString()}`;
    document.getElementById('crosshair').style.borderColor = `#${neonColor.getHexString()}`;
}

function updateChunks() {
    const cx = Math.floor(player.pos.x / CONFIG.chunkSize);
    const cz = Math.floor(player. pos.z / CONFIG.chunkSize);
    const activeKeys = new Set();

    for(let x = -CONFIG.renderDist; x <= CONFIG.renderDist; x++) {
        for(let z = -CONFIG.renderDist; z <= CONFIG.renderDist; z++) {
            const key = `${cx+x},${cz+z}`;
            activeKeys.add(key);
            if(! chunks.has(key)) createChunk(cx+x, cz+z, key);
        }
    }
    for(const [key, chunk] of chunks) {
        if(! activeKeys.has(key)) {
            scene.remove(chunk.mesh);
            chunk.colliders.forEach(c => { 
                const idx = colliders.indexOf(c); if(idx > -1) colliders.splice(idx, 1); 
                const mIdx = wallMeshes.findIndex(m => m.userData.box === c);
                if(mIdx > -1) wallMeshes.splice(mIdx, 1);
            });
            chunks.delete(key);
        }
    }
}

function createChunk(cx, cz, key) {
    const grp = new THREE.Group();
    const offset = { x: cx * CONFIG.chunkSize, z: cz * CONFIG.chunkSize };

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.chunkSize, CONFIG.chunkSize), new THREE.MeshStandardMaterial({ map: Textures.floor, roughness: 0.1, metalness: 0.5 }));
    floor.rotation.x = -Math.PI/2;
    floor.position. set(offset.x, 0, offset.z);
    grp.add(floor);

    const chunkColliders = [];
    const numWalls = 4 + Math.floor(Math.random()*4);
    const wallMat = new THREE.MeshStandardMaterial({ map: Textures.wall, emissive: 0xff0055, emissiveIntensity: 0.5 });
    
    for(let i=0; i<numWalls; i++) {
        const w = 5 + Math.random()*10;
        const h = 8 + Math.random()*6;
        const wx = offset.x + (Math.random()-0.5) * CONFIG.chunkSize;
        const wz = offset.z + (Math.random()-0.5) * CONFIG.chunkSize;
        
        if(Math.abs(wx) < 15 && Math.abs(wz) < 15) continue; 

        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), wallMat. clone()); 
        wall.position. set(wx, h/2, wz);
        wall.rotation.y = Math.random() > 0.5 ? 0 : Math.PI/2;
        grp.add(wall);
        
        const box = new THREE.Box3().setFromObject(wall);
        wall.userData. box = box; 
        wall.userData.isBreakable = true; 
        
        colliders.push(box);
        chunkColliders.push(box);
        wallMeshes.push(wall);
    }
    scene.add(grp);
    chunks.set(key, { mesh: grp, colliders: chunkColliders });
}

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 30 + Math.random() * 20;
    const x = player.pos.x + Math.cos(angle)*radius;
    const z = player.pos.z + Math.sin(angle)*radius;

    const tier = Math.random();
    let type = 0; 
    if(tier > 0.6) type = 1;
    if(tier > 0.9) type = 2;

    let geo, color, hp, speed, scale;

    if(type === 0) { 
        geo = new THREE.TetrahedronGeometry(1. 0);
        color = 0xff0055; hp = 3; speed = 14; scale = 1;
    } else if (type === 1) { 
        geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        color = 0x00ff88; hp = 8; speed = 9; scale = 1.2;
    } else { 
        geo = new THREE.DodecahedronGeometry(1.2);
        color = 0x00ffff; hp = 20; speed = 5; scale = 1.5;
    }

    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: color, wireframe: true });
    const core = new THREE.Mesh(geo. clone(), new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:0.3 }));
    core.scale.set(0.5,0.5,0.5);
    
    const wireMesh = new THREE.Mesh(geo, mat);
    grp.add(wireMesh, core);
    
    grp.position.set(x, 2, z);
    grp.scale.set(scale, scale, scale);
    
    grp.userData = { hp, speed, type, offset: Math.random()*100 };
    grp.userData.box = new THREE.Box3();

    scene.add(grp);
    enemies.push(grp);
}

function updateEnemies(dt) {
    if(enemies.length < CONFIG.maxEnemies) spawnEnemy();
    
    const dir = new THREE.Vector3();
    const eBox = new THREE.Box3();
    const raycaster = new THREE.Raycaster();

    for(let i=enemies.length-1; i>=0; i--) {
        const e = enemies[i];
        const dist = e.position.distanceTo(player.pos);
        
        e.children[0].rotation.y += dt * (e.userData.type === 0 ? 5 : 2); 
        e.children[0].rotation.z += dt * 2;
        e.position.y = 2. 5 + Math.sin(clock.elapsedTime * 3 + e.userData.offset) * 0.5;

        if(dist > CONFIG.chunkSize * 3) { scene.remove(e); enemies.splice(i, 1); continue; }

        if(! player.dead) {
            if(dist > 2. 5) {

                dir.subVectors(player.pos, e.position). normalize();
                
                raycaster.set(e.position, dir);
                const hits = raycaster.intersectObjects(wallMeshes);
                
                if(hits. length > 0 && hits[0].distance < 5) {

                    const avoidance = new THREE.Vector3(). crossVectors(dir, new THREE.Vector3(0,1,0));
                    dir.add(avoidance.multiplyScalar(1.5)). normalize();
                }

                const moveVec = dir.multiplyScalar(e.userData.speed * dt);
                
                const nextPos = e.position.clone(). add(moveVec);
                eBox.setFromCenterAndSize(nextPos, new THREE.Vector3(2, 2, 2));
                
                let collision = false;
                for(let c of colliders) if(c.intersectsBox(eBox)) { collision = true; break; }

                if(!collision) { 
                    e.position. add(moveVec); 
                    e.lookAt(player.pos); 
                } else {
                    e.position.x += moveVec.x * 0.2; 
                    e.position. z += moveVec.z * 0.2;
                }
            }

            if(dist < 3. 5) {
                player.hp -= (e.userData.type === 2 ? 60 : 30) * dt; 
                player.lastDamageTime = Date.now();
                if(player.hp < 0) player.hp = 0;
                document.getElementById('hp-fill').style.width = player.hp + '%';
                addTrauma(0.5 * dt);
                document.getElementById('damage-fx').style.opacity = Math.min(0.8, (100 - player.hp) / 100);
                if(player.hp <= 0 && ! player.dead) gameOver();
            }
        }
    }
}

function addTrauma(amount) {
    cameraShake = Math.min(cameraShake + amount, 1. 0);
}

function performDash() {
    const now = Date.now();
    if(now - player.lastDash < CONFIG.dashCooldown) return;
    
    player.lastDash = now;
    
    const forward = new THREE.Vector3(0,0,-1). applyAxisAngle(new THREE.Vector3(0,1,0), camRot. y);
    const right = new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), camRot.y);
    
    const dashDir = new THREE.Vector3();
    if(input.w) dashDir.add(forward); if(input.s) dashDir. sub(forward);
    if(input. d) dashDir.add(right); if(input.a) dashDir.sub(right);
    if(dashDir.length() === 0) dashDir.copy(forward);
    dashDir.normalize();

    player.vel.x = dashDir.x * CONFIG.dashForce; 
    player.vel.z = dashDir.z * CONFIG. dashForce;
    player.vel.y = 2; 

    camera.fov = player.baseFov + 20;
    camera.updateProjectionMatrix();

    weaponBody.material.opacity = 0.5;
    weaponBody.material.transparent = true;
    setTimeout(() => { weaponBody.material.opacity = 1; weaponBody.material.transparent = false; }, 300);

    spawnParticles(player.pos, 15, 0x00ffff, true);
    createShockwave(player.pos, CONFIG.dashForce);
    playSound('shoot'); 
}

function fireWeapon() {
    const now = Date.now();
    const w = WEAPONS[player.weaponIdx];
    if(now - player.lastFire < w.fireRate) return;
    player.lastFire = now;

    recoil = w.recoil;
    addTrauma(w.recoil * 0.5);
    muzzleLight.intensity = 8;
    setTimeout(() => muzzleLight.intensity = 0, 50);
    playSound('shoot');

    if(player.weaponIdx === 1) {
        setTimeout(() => {
            document.getElementById('crosshair').style.opacity = '0';
        }, 50);
        setTimeout(() => {
            document.getElementById('crosshair').style.opacity = '1';
        }, 150);
    }

    for(let i=0; i<w.count; i++) {
        const proj = new THREE. Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), new THREE.MeshBasicMaterial({color: w.color}));
        const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
        dir.x += (Math.random() - 0. 5) * w.spread;
        dir.y += (Math.random() - 0.5) * w.spread;
        dir.normalize();

        proj.position.copy(camera.position). add(dir). add(new THREE.Vector3(0, -0.15, 0));
        proj. quaternion.copy(camera.quaternion);
        
        scene.add(proj);
        projectiles.push({ mesh: proj, vel: dir. multiplyScalar(150), life: 1. 5, damage: w.damage });
    }
}

function updateProjectiles(dt) {
    const pBox = new THREE.Box3();
    const eBox = new THREE.Box3();

    for(let i=projectiles.length-1; i>=0; i--) {
        const p = projectiles[i];
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
        p.life -= dt;
        
        let hit = false;
        pBox.setFromObject(p. mesh);

        for(let j=enemies.length-1; j>=0; j--) {
            const e = enemies[j];
            eBox.setFromCenterAndSize(e.position, new THREE.Vector3(2,2,2)); 
            if(eBox.intersectsBox(pBox)) {
                hit = true; e.userData.hp -= p.damage;
                spawnParticles(p.mesh.position, 8, 0x00ffff);
                spawnParticles(p.mesh.position, 5, 0xff00ff);
                spawnParticles(p.mesh.position, 6, 0x00ffaa);
                playSound('hit');
                
                const hm = document.getElementById('hitmarker');
                hm.style.opacity = 1; hm.style.transform = "translate(-50%, -50%) scale(1.3) rotate(10deg)";
                setTimeout(() => { hm.style.opacity = 0; hm.style. transform = "translate(-50%, -50%) scale(1)"; }, 100);

                if(e.userData.hp <= 0) {
                    spawnParticles(e.position, 25, 0xff0055, true);
                    scene.remove(e); enemies.splice(j, 1);
                    player.score += 150;
                    addTrauma(0.2);

                    const coolTexts = ["🔥 HEADSHOT!", "⚡ INSANE!", "💥 OBLITERATED!", "🎯 PERFECT!", "✨ LEGENDARY! "];
                    if(Math.random()>0.3) showFloatingText(coolTexts[Math.floor(Math.random()*5)], null);
                }
                break;
            }
        }
        if(!hit) {
            for(let c of colliders) if(c. intersectsBox(pBox)) { hit=true; spawnParticles(p.mesh.position, 2, 0xffaa00); break; }
        }
        if(hit || p.life <= 0) { scene.remove(p.mesh); projectiles.splice(i, 1); }
    }
}

function spawnParticles(pos, count, color, isExplosion = false) {
    const geometries = [ new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.TetrahedronGeometry(0. 3) ];
    for(let i=0; i<count; i++) {
        const geo = geometries[Math.floor(Math. random() * geometries.length)];
        const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 2, roughness: 0.1 });
        const mesh = new THREE.Mesh(geo, mat);
        const spread = isExplosion ? 1. 5 : 0.5;
        mesh.position.copy(pos).add(new THREE. Vector3((Math.random()-0.5)*spread, (Math.random()-0.5)*spread, (Math. random()-0.5)*spread));
        mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math. random()*Math.PI);
        scene.add(mesh);
        particles.push({ 
            mesh, 
            vel: new THREE.Vector3((Math.random()-0.5) * (isExplosion?  30:10), (Math.random()-0. 5) * (isExplosion? 30:10) + 5, (Math.random()-0.5) * (isExplosion? 30:10)), 
            rotVel: { x: (Math.random()-0.5)*10, y: (Math.random()-0.5)*10 },
            life: 1. 0, startScale: 1. 0
        });
    }
}

function createShockwave(pos, speed) {
    if(! CONFIG.shockwaveEnabled) return;
    
    const geometry = new THREE.TorusGeometry(1, 0.2, 8, 50);
    const material = new THREE.MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.6,
        wireframe: true
    });
    
    const torus = new THREE.Mesh(geometry, material);
    torus.position.copy(pos);
    torus.rotation.x = Math.random() * Math.PI;
    scene.add(torus);
    
    shockwaves.push({
        mesh: torus,
        life: 0.8,
        maxLife: 0.8,
        expandSpeed: speed * 0.5
    });
}

function addMotionTrail(dt) {
    const speed = new THREE.Vector3(player.vel.x, 0, player.vel.z).length();
    if(speed > 25 && CONFIG.trailEnabled && Math.random() > 0.3) {
        const geometry = new THREE.SphereGeometry(0.3, 6, 6);
        const material = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            transparent: true,
            opacity: CONFIG.trailOpacity,
            wireframe: true
        });
        
        const sphere = new THREE. Mesh(geometry, material);
        sphere.position.copy(player.pos). add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.5,
            0,
            (Math.random() - 0.5) * 0.5
        ));
        scene.add(sphere);
        
        motionTrail.push({
            mesh: sphere,
            life: 0.5
        });
    }
}

function spawnSpeedLines(dt) {
    const speed = new THREE.Vector3(player.vel.x, 0, player.vel.z).length();
    if(speed > 30 && CONFIG.speedLinesEnabled) {
        for(let i = 0; i < 3; i++) {
            speedLines.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                life: 0.3,
                speed: 20 + Math.random() * 10,
                width: 1 + Math.random() * 3,
                color: `hsl(${player.baseHue}, 100%, 50%)`
            });
        }
    }
}

function updateShockwaves(dt) {
    for(let i = shockwaves.length - 1; i >= 0; i--) {
        const sw = shockwaves[i];
        sw.life -= dt;
        sw.mesh.scale.x += sw.expandSpeed * dt;
        sw.mesh.scale.z += sw.expandSpeed * dt;
        sw.mesh.material.opacity = (sw.life / sw.maxLife) * 0.6;
        
        if(sw.life <= 0) {
            scene.remove(sw.mesh);
            shockwaves.splice(i, 1);
        }
    }
}

function updateMotionTrail(dt) {
    for(let i = motionTrail.length - 1; i >= 0; i--) {
        const trail = motionTrail[i];
        trail.life -= dt;
        trail.mesh.material.opacity = (trail.life / 0.5) * CONFIG.trailOpacity;
        if(trail.life <= 0) {
            scene.remove(trail.mesh);
            motionTrail.splice(i, 1);
        }
    }
}

function updatePhysics(dt) {
    if(player.dead) return;

    if(Date.now() - player.lastDamageTime > CONFIG.regenDelay && player.hp < 100) {
        player.hp += dt * 20; 
        if(player.hp > 100) player.hp = 100;
        document.getElementById('hp-fill').style.width = player.hp + '%';
        document.getElementById('damage-fx').style.opacity = 0;
    }

    if(cameraShake > 0) {
        cameraShake -= dt * 2; if(cameraShake<0) cameraShake=0;
        const amt = cameraShake*cameraShake * 0.5;
        camera.position.add(new THREE.Vector3((Math.random()-0.5)*amt, (Math.random()-0.5)*amt, (Math. random()-0.5)*amt));
    }
    camera.rotation.set(camRot. x, camRot.y, 0, 'YXZ');

    const speed = new THREE.Vector3(player.vel.x, 0, player.vel.z).length();
    
    const targetFov = player.baseFov + Math.min(speed * 0.3, 25);
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 5);
    camera.updateProjectionMatrix();

    const pulse = Math.sin(clock.elapsedTime * 10) * 0.05; 
    weaponGroup.scale.set(1+pulse, 1+pulse, 1);
    
    weaponSway. x = THREE.MathUtils.lerp(weaponSway.x, input.mouseX * -0.003, 0.1);
    weaponSway.y = THREE.MathUtils.lerp(weaponSway.y, input.mouseY * -0.003, 0.1);
    
    if(recoil > 0) recoil -= dt * 3; else recoil = 0;
    
    weaponGroup.position.set(
        0. 3 + weaponSway.x, 
        -0.25 + weaponSway.y + Math.sin(clock.elapsedTime*12)*(speed>1?0.02:0.005), 
        -0.5 + recoil
    );
    weaponGroup.rotation.z = weaponSway.x * 2;

    input.mouseX = 0; input.mouseY = 0;

    const forward = new THREE.Vector3(0,0,-1). applyAxisAngle(new THREE.Vector3(0,1,0), camRot.y);
    const right = new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), camRot. y);
    const wishDir = new THREE.Vector3();
    if(input.w) wishDir.add(forward); if(input.s) wishDir. sub(forward);
    if(input. d) wishDir.add(right); if(input.a) wishDir.sub(right);
    if(wishDir.length() > 0) wishDir.normalize();

    if(player.onGround) {
        const spd = player.vel.length();
        if(spd > 0) {
            const drop = spd * CONFIG.friction * dt;
            player.vel.multiplyScalar(Math.max(spd - drop, 0) / spd);
        }
    }

    const accel = player.onGround ? CONFIG.groundAccel : CONFIG.airAccel;
    const currentSpeed = player.vel.dot(wishDir);
    const addSpeed = CONFIG.moveSpeed - currentSpeed;
    if(addSpeed > 0) player.vel.add(wishDir.multiplyScalar(Math.min(accel * CONFIG.moveSpeed * dt, addSpeed)));

    player.vel.y -= CONFIG.gravity * dt;
    if(input.space && player.onGround) {
        player. vel.y = CONFIG.jumpForce;
        player.onGround = false;
        spawnParticles(player.pos. clone().sub(new THREE.Vector3(0,2,0)), 5, 0xffffff);
    }

    const nextPos = player.pos.clone(). add(player.vel.clone().multiplyScalar(dt));
    
    const pBox = new THREE.Box3();
    pBox.setFromCenterAndSize(new THREE.Vector3(nextPos.x, player.pos.y, player.pos.z), new THREE. Vector3(0.5, 1. 8, 0.5));
    
    let colX = false; 
    let hitWall = null;

    for(let w of wallMeshes) {
        if(w.userData.box.intersectsBox(pBox)) {
            colX = true; hitWall = w; break;
        }
    }

    if(colX) {
        if(speed > CONFIG.wallBreakSpeed && hitWall && hitWall.userData.isBreakable) {
            spawnParticles(hitWall.position, 30, 0xff0055, true); 
            playSound('smash');
            showFloatingText(["WTF!  !", "SMASH!", "BOOM!  "][Math.floor(Math.random()*3)], null);
            addTrauma(0.5);
            scene.remove(hitWall);
            wallMeshes.splice(wallMeshes.indexOf(hitWall), 1);
            colliders.splice(colliders.indexOf(hitWall. userData.box), 1);
            player.pos.x = nextPos.x;
        } else {
            player.vel.x = 0; 
        }
    } else {
        player.pos.x = nextPos.x;
    }

    pBox.setFromCenterAndSize(new THREE.Vector3(player.pos.x, player.pos.y, nextPos.z), new THREE.Vector3(0.5, 1.8, 0.5));
    let colZ = false; hitWall = null;
    for(let w of wallMeshes) {
        if(w.userData.box.intersectsBox(pBox)) {
            colZ = true; hitWall = w; break;
        }
    }

    if(colZ) {
        if(speed > CONFIG.wallBreakSpeed && hitWall && hitWall.userData.isBreakable) {
            spawnParticles(hitWall. position, 30, 0xff0055, true);
            playSound('smash');
            showFloatingText("UNSTOPPABLE!", null);
            addTrauma(0.5);
            scene.remove(hitWall);
            wallMeshes. splice(wallMeshes.indexOf(hitWall), 1);
            colliders.splice(colliders.indexOf(hitWall. userData.box), 1);
            player.pos.z = nextPos.z;
        } else {
            player.vel.z = 0;
        }
    } else {
        player.pos.z = nextPos.z;
    }

    player.pos.y += player.vel.y * dt;
    if(player.pos.y < 2) {
        player.pos.y = 2;
        player.vel.y = 0;
        player.onGround = true;
    } else {
        player.onGround = false;
    }

    camera.position.copy(player.pos);
    document.getElementById('speed-val').innerText = Math.round(speed);
    document.getElementById('speed-val'). style.color = speed > CONFIG.wallBreakSpeed ? '#f0f' : '#fff';
}

function gameOver() {
    player.dead = true;
    document.exitPointerLock();
    document.getElementById('menu-title').innerText = "ÖLDÜN";
    document.getElementById('start-btn').innerText = "TEKRAR OYNA";
    document.getElementById('menu'). style.display = 'flex';
}

function onKey(e, v) {
    const k = e.key.toLowerCase();
    if(k==='w') input.w=v; if(k==='s') input. s=v; if(k==='a') input.a=v; if(k==='d') input.d=v;
    if(k===' ') input.space=v;
    if(k==='shift' && v===1) performDash();
    if(v===1) {
        if(k==='1') { player.weaponIdx = 0; updateWeaponVisuals(); }
        if(k==='2') { player. weaponIdx = 1; updateWeaponVisuals(); }
    }
}

function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);

    updateChunks();
    updatePhysics(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateNeonWorld(dt);
    
    addMotionTrail(dt);
    updateMotionTrail(dt);
    spawnSpeedLines(dt);
    updateShockwaves(dt);
    
    for(let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.life -= dt * 1.5; 
        p.vel.y -= 25 * dt;
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
        p.mesh.rotation.x += p.rotVel.x * dt;
        p.mesh.rotation.y += p.rotVel.y * dt;
        p.mesh. scale.setScalar(Math.max(0, p.life * p.startScale));
        if(p.life <= 0) { scene.remove(p.mesh); p.mesh. geometry.dispose(); p.mesh.material.dispose(); particles.splice(i, 1); }
    }
    composer.render();
}

window.onload = init;
