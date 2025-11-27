const CONFIG = {
    moveSpeed: 18, runSpeed: 30,
    gravity: 45, jumpForce: 16,
    friction: 8.0, airAccel: 25.0, groundAccel: 80.0,
    chunkSize: 50, renderDist: 2, maxEnemies: 15, 
    dashForce: 85, dashCooldown: 1000, 
    neonSpeed: 0.1,
    regenDelay: 5000, 
    wallBreakSpeed: 70,
    maxFovBonus: 22,
    speedShakeThreshold: 28,
    speedRingInterval: 400,
    speedRingMax: 6,
    maxParticles: 280,
    shieldColor: 0xff33cc,
    shieldDuration: 3000,
    shieldCooldown: 9000,
    shieldRadius: 6,
    shieldHeight: 9,
    shieldMinOpacity: 0.08,
    shieldMaxOpacity: 0.22,
    rocketSpeed: 80,
    rocketExplosionRadius: 7,
    rocketSelfKnockback: 4,
    rocketDamage: 120,
    blackHoleCooldown: 9000,
    blackHoleDuration: 2600,
    blackHoleRadius: 10,
    blackHolePull: 45,
    shieldSides: 3
};

const WEAPONS = [
    { name: "RIFLE", color: 0x00ff88, damage: 1, fireRate: 90, spread: 0.02, count: 1, recoil: 0.2, projectile: 'bullet' },
    { name: "SHOTGUN", color: 0xffaa00, damage: 1, fireRate: 800, spread: 0.15, count: 8, recoil: 0.6, projectile: 'bullet' },
    { name: "ROCKET", color: 0xff6633, damage: 35, fireRate: 1200, spread: 0.005, count: 1, recoil: 1.1, projectile: 'rocket' }
];

const Textures = {
    floor: null, wall: null,
    init() {
        const c1 = document.createElement('canvas'); c1.width=1024; c1.height=1024;
        const ctx1 = c1.getContext('2d');
        ctx1.fillStyle = '#050505'; ctx1.fillRect(0,0,1024,1024);
        ctx1.strokeStyle = '#1f1f1f'; ctx1.lineWidth = 4;
        ctx1.beginPath();
        for(let i=0; i<=1024; i+=128) { ctx1.moveTo(i,0); ctx1.lineTo(i,1024); ctx1.moveTo(0,i); ctx1.lineTo(1024,i); }
        ctx1.stroke();
        this.floor = new THREE.CanvasTexture(c1);
        this.floor.wrapS = this.floor.wrapT = THREE.RepeatWrapping;

        const c2 = document.createElement('canvas'); c2.width=512; c2.height=512;
        const ctx2 = c2.getContext('2d');
        const grd = ctx2.createLinearGradient(0,0,0,512);
        grd.addColorStop(0, '#222'); grd.addColorStop(1, '#000');
        ctx2.fillStyle = grd; ctx2.fillRect(0,0,512,512);
        ctx2.strokeStyle = '#ff0055'; ctx2.lineWidth = 10;
        ctx2.strokeRect(0,0,512,512);
        ctx2.lineWidth = 2; ctx2.beginPath(); ctx2.moveTo(0,0); ctx2.lineTo(512,512); ctx2.moveTo(512,0); ctx2.lineTo(0,512); ctx2.stroke();
        this.wall = new THREE.CanvasTexture(c2);
    }
};

let scene, camera, renderer, composer, clock;
let player = { 
    pos: new THREE.Vector3(0,5,0), vel: new THREE.Vector3(), 
    hp: 100, maxHp: 100, score: 0, dead: false, onGround: false,
    baseFov: 90, weaponIdx: 0, lastFire: 0,
    baseHue: 0, lastDash: 0, lastDamageTime: 0,
    killStreak: 0, highestSpeed: 0
};
let input = { w:0, a:0, s:0, d:0, space:0, mouseX:0, mouseY:0 };
let camRot = { x: 0, y: 0 };
let cameraShake = 0;
let lastSpeedRing = 0;

const chunks = new Map();
const colliders = []; 
const wallMeshes = []; 
const enemies = [];
const projectiles = [];
const particles = [];
const speedRings = [];
const bulletHoles = [];
const floatingTexts = [];

let weaponGroup, muzzleLight, weaponBody, weaponRail;
let weaponSway = { x:0, y:0, tilt: 0 };
let recoil = 0;
let shield = {
    active: false,
    mesh: null,
    expires: 0,
    cooldownEnd: 0,
    state: 'idle',
    buildProgress: 0,
    buildStart: 0,
    buildDuration: 650,
    lines: [],
    shell: null,
    innerCore: null,
    floorGlyph: null
};

const AudioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
    if(AudioCtx.state === 'suspended') AudioCtx.resume();
    const osc = AudioCtx.createOscillator();
    const gain = AudioCtx.createGain();
    const now = AudioCtx.currentTime;

    if(type === 'shoot') {
        if(player.weaponIdx === 2) {
            osc.frequency.setValueAtTime(120, now);
            osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
            osc.type = 'sawtooth';
        } else {
            osc.frequency.setValueAtTime(player.weaponIdx===0?800:150, now);
            osc.frequency.exponentialRampToValueAtTime(50, now + 0.15);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
            osc.type = player.weaponIdx===0?'sawtooth':'square';
        }
    } 
    else if(type === 'hit') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(0, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
    }
    else if(type === 'smash') { 
        osc.type = 'square';
        osc.frequency.setValueAtTime(100, now);
        osc.frequency.exponentialRampToValueAtTime(10, now + 0.5);
        gain.gain.setValueAtTime(0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
        gain.gain.linearRampToValueAtTime(0, now + 0.6);
    }
    else if(type === 'dash') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        gain.gain.linearRampToValueAtTime(0, now + 0.3);
    }
    else if(type === 'shield_on') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.linearRampToValueAtTime(640, now + 0.2);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.45);
    }
    else if(type === 'shield_burst') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(12, now + 0.6);
        gain.gain.setValueAtTime(0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        gain.gain.linearRampToValueAtTime(0, now + 0.65);
    }
    
    osc.connect(gain); gain.connect(AudioCtx.destination);
    osc.start(); osc.stop(now + 0.5);
}

window.playSound = playSound;

function showFloatingText(text, pos) {
    const div = document.createElement('div');
    div.innerText = text;
    div.style.position = 'absolute';
    div.style.color = '#fff';
    div.style.fontSize = '40px';
    div.style.fontWeight = '900';
    div.style.fontStyle = 'italic';
    div.style.textShadow = '0 0 20px #ff0055';
    div.style.pointerEvents = 'none';
    div.style.transform = 'translate(-50%, -50%)';
    div.style.transition = 'all 0.8s ease-out';
    div.style.left = '50%'; div.style.top = '50%'; 
    document.body.appendChild(div);
    
    const x = window.innerWidth/2 + (Math.random()-0.5)*400;
    const y = window.innerHeight/2 + (Math.random()-0.5)*200 - 100;
    
    requestAnimationFrame(() => {
        div.style.left = x + 'px'; 
        div.style.top = y + 'px';
        div.style.transform = 'translate(-50%, -50%) scale(1.5) rotate(' + (Math.random()*20-10) + 'deg)';
        div.style.opacity = '0';
    });

    setTimeout(() => div.remove(), 1000);
}

window.showFloatingText = showFloatingText;

function handleEnemyDeath(index, particleColor = 0xff0055, weapon = 'bullet') {
    const enemy = enemies[index];
    if(!enemy) return;

    // Different death effects per weapon
    if(weapon === 'rocket') {
        spawnParticles(enemy.position, 40, 0xff6633, true);
        spawnPrismBurst(enemy.position);
        addTrauma(0.4);
        showFloatingText(["INCINERATED!", "VAPORIZED!", "OBLITERATED!"][Math.floor(Math.random()*3)], null);
    } else if(weapon === 'shotgun') {
        spawnParticles(enemy.position, 20, 0xffaa00, true);
        for(let i=0; i<8; i++) {
            const shard = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.2, 0.2),
                new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent:true, opacity:0.8 })
            );
            shard.position.copy(enemy.position);
            shard.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
            scene.add(shard);
            particles.push({
                mesh: shard,
                vel: new THREE.Vector3(Math.random()-0.5, Math.random()*2, Math.random()-0.5).normalize().multiplyScalar(15),
                rotVel: { x: (Math.random()-0.5)*15, y: (Math.random()-0.5)*15 },
                life: 0.8,
                startScale: 1.0
            });
        }
        addTrauma(0.3);
        showFloatingText(["SHREDDED!", "BLASTED!", "MUTILATED!"][Math.floor(Math.random()*3)], null);
    } else {
        spawnParticles(enemy.position, 25, particleColor, true);
        addTrauma(0.2);
        if(Math.random()>0.7) showFloatingText(["NICE!", "BOOM!", "PERFECT!"][Math.floor(Math.random()*3)], null);
    }

    player.score += enemy.userData.points;
    player.killStreak++;

    if(player.killStreak === 3) showFloatingText("TRIPLE KILL!", null);
    else if(player.killStreak === 5) showFloatingText("UNSTOPPABLE!", null);
    else if(player.killStreak === 10) showFloatingText("GODLIKE!", null);

    enemy.children.forEach(child => {
        if(child.geometry) child.geometry.dispose();
        if(child.material) child.material.dispose();
    });
    
    scene.remove(enemy);
    enemies.splice(index, 1);
}

window.handleEnemyDeath = handleEnemyDeath;

function init() {
    Textures.init();
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x000000, 0.02);
    
    camera = new THREE.PerspectiveCamera(player.baseFov, window.innerWidth/window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const bloomPass = new THREE.UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.threshold = 0.1; bloomPass.strength = 1.5; bloomPass.radius = 0.5;
    
    composer = new THREE.EffectComposer(renderer);
    composer.addPass(new THREE.RenderPass(scene, camera));
    composer.addPass(bloomPass);
    
    clock = new THREE.Clock();
    createWeapon();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth/window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        composer.setSize(window.innerWidth, window.innerHeight);
    });

    document.addEventListener('mousemove', e => {
        if(document.pointerLockElement && !player.dead) {
            camRot.y -= e.movementX * 0.002;
            camRot.x -= e.movementY * 0.002;
            camRot.x = Math.max(-1.5, Math.min(1.5, camRot.x));
            input.mouseX = e.movementX; input.mouseY = e.movementY;
        }
    });
    
    document.addEventListener('wheel', e => {
        if(document.pointerLockElement && !player.dead) {
            e.preventDefault();
            if(e.deltaY < 0) {
                player.weaponIdx = (player.weaponIdx - 1 + WEAPONS.length) % WEAPONS.length;
            } else {
                player.weaponIdx = (player.weaponIdx + 1) % WEAPONS.length;
            }
            updateWeaponVisuals();
        }
    });
    document.addEventListener('mousedown', () => { if(!player.dead && document.pointerLockElement) fireWeapon(); });
    document.addEventListener('keydown', e => onKey(e, 1));
    document.addEventListener('keyup', e => onKey(e, 0));
    document.getElementById('start-btn').addEventListener('click', startGame);
}

window.init = init;

function startGame() {
    if(player.dead) { location.reload(); return; }
    document.getElementById('menu').style.display = 'none';
    document.body.requestPointerLock();
    if(AudioCtx.state === 'suspended') AudioCtx.resume();
    player.lastDamageTime = Date.now();
    updateHUD();
    loop();
}

function showMessage(text, duration = 600) {
    const msg = document.getElementById('message');
    if(!msg) return;
    msg.textContent = text;
    msg.style.opacity = '1';
    clearTimeout(showMessage._timeout);
    showMessage._timeout = setTimeout(() => {
        msg.style.opacity = '0';
    }, duration);
}

window.startGame = startGame;

function updateHUD() {
    document.getElementById('hp-val').innerText = Math.ceil(player.hp);
    document.getElementById('hp-fill').style.width = (player.hp / player.maxHp * 100) + '%';
}

window.updateHUD = updateHUD;

function createWeapon() {
    weaponGroup = new THREE.Group();
    const matBody = new THREE.MeshStandardMaterial({ color: 0x111, roughness: 0.2, metalness: 0.9 });
    const matGlow = new THREE.MeshBasicMaterial({ color: 0x00ff88 });

    weaponBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.7), matBody);
    weaponRail = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.65), matGlow);
    weaponRail.position.y = 0.1;
    
    weaponGroup.add(weaponBody, weaponRail);
    muzzleLight = new THREE.PointLight(0x00ffff, 0, 15);
    muzzleLight.position.set(0, 0, -0.8);
    weaponGroup.add(muzzleLight);

    weaponGroup.position.set(0.3, -0.25, -0.5);
    camera.add(weaponGroup);
    scene.add(camera);
}

window.createWeapon = createWeapon;

function updateWeaponVisuals() {
    const w = WEAPONS[player.weaponIdx];
    weaponRail.material.color.setHex(w.color);
    muzzleLight.color.setHex(w.color);
    if(player.weaponIdx === 0) {
        weaponBody.scale.set(1, 1, 1);
        document.getElementById('crosshair').style.cssText = "width:4px; height:4px; border-radius:50%; background:#00ff88; box-shadow:0 0 10px #00ff88;";
    } else if(player.weaponIdx === 1) {
        weaponBody.scale.set(1.5, 0.8, 0.8);
        document.getElementById('crosshair').style.cssText = "width:20px; height:20px; border-radius:2px; background:#ffaa00; box-shadow:0 0 10px #ffaa00;";
    } else if(player.weaponIdx === 2) {
        weaponBody.scale.set(1.8, 1.2, 0.6);
        document.getElementById('crosshair').style.cssText = "width:16px; height:16px; border-radius:50%; background:#ff6633; box-shadow:0 0 15px #ff6633, inset 0 0 8px #ff6633;";
    }
    document.getElementById('weapon-name').innerText = w.name;
    document.getElementById('weapon-name').style.color = '#' + w.color.toString(16).padStart(6, '0');
}

window.updateWeaponVisuals = updateWeaponVisuals;

function updateNeonWorld(dt) {
    player.baseHue += CONFIG.neonSpeed * dt * 50;
    if(player.baseHue > 360) player.baseHue = 0;
    const neonColor = new THREE.Color(`hsl(${player.baseHue}, 80%, 50%)`);
    const fogColor = new THREE.Color(`hsl(${player.baseHue}, 60%, 5%)`); 

    scene.fog.color.lerp(fogColor, 0.1);
    renderer.setClearColor(scene.fog.color);

    chunks.forEach(chunk => {
        chunk.mesh.children.forEach(child => {
            if(child.material && child.material.emissive) {
                if(child.geometry.type === 'BoxGeometry') child.material.emissive.lerp(neonColor, 0.1);
            }
        });
    });
    
    const hpFill = document.getElementById('hp-fill');
    if(player.hp > 50) {
        hpFill.style.background = `#${neonColor.getHexString()}`;
        hpFill.style.boxShadow = `0 0 15px #${neonColor.getHexString()}`;
    } else {
        hpFill.style.background = '#ff0055';
        hpFill.style.boxShadow = '0 0 15px #ff0055';
    }
    
    const crosshair = document.getElementById('crosshair');
    crosshair.style.background = `#${neonColor.getHexString()}`;
    crosshair.style.boxShadow = `0 0 10px #${neonColor.getHexString()}`;
}

window.updateNeonWorld = updateNeonWorld;

function updateChunks() {
    const cx = Math.floor(player.pos.x / CONFIG.chunkSize);
    const cz = Math.floor(player.pos.z / CONFIG.chunkSize);
    const activeKeys = new Set();

    for(let x = -CONFIG.renderDist; x <= CONFIG.renderDist; x++) {
        for(let z = -CONFIG.renderDist; z <= CONFIG.renderDist; z++) {
            const key = `${cx+x},${cz+z}`;
            activeKeys.add(key);
            if(!chunks.has(key)) createChunk(cx+x, cz+z, key);
        }
    }
    
    for(const [key, chunk] of chunks) {
        if(!activeKeys.has(key)) {
            scene.remove(chunk.mesh);
            
            chunk.mesh.children.forEach(child => {
                if(child.geometry) child.geometry.dispose();
                if(child.material) {
                    if(Array.isArray(child.material)) {
                        child.material.forEach(mat => mat.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
            
            chunk.colliders.forEach(c => { 
                const idx = colliders.indexOf(c); 
                if(idx > -1) colliders.splice(idx, 1); 
            });
            
            chunk.walls?.forEach(wall => {
                const idx = wallMeshes.indexOf(wall);
                if(idx > -1) wallMeshes.splice(idx, 1);
            });
            
            chunks.delete(key);
        }
    }
}

window.updateChunks = updateChunks;

function createChunk(cx, cz, key) {
    const grp = new THREE.Group();
    const offset = { x: cx * CONFIG.chunkSize, z: cz * CONFIG.chunkSize };

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(CONFIG.chunkSize, CONFIG.chunkSize), new THREE.MeshStandardMaterial({ map: Textures.floor, roughness: 0.1, metalness: 0.5 }));
    floor.rotation.x = -Math.PI/2;
    floor.position.set(offset.x, 0, offset.z);
    grp.add(floor);

    const chunkColliders = [];
    const chunkWalls = [];
    const numWalls = 4 + Math.floor(Math.random()*4);
    const wallMat = new THREE.MeshStandardMaterial({ map: Textures.wall, emissive: 0xff0055, emissiveIntensity: 0.5 });
    
    for(let i=0; i<numWalls; i++) {
        const w = 5 + Math.random()*10;
        const h = 8 + Math.random()*6;
        const wx = offset.x + (Math.random()-0.5) * CONFIG.chunkSize;
        const wz = offset.z + (Math.random()-0.5) * CONFIG.chunkSize;
        
        if(Math.abs(wx) < 15 && Math.abs(wz) < 15) continue; 

        const wall = new THREE.Mesh(new THREE.BoxGeometry(w, h, 2), wallMat.clone()); 
        wall.position.set(wx, h/2, wz);
        wall.rotation.y = Math.random() > 0.5 ? 0 : Math.PI/2;
        grp.add(wall);
        
        const box = new THREE.Box3().setFromObject(wall);
        wall.userData.box = box; 
        wall.userData.isBreakable = true; 
        
        colliders.push(box);
        chunkColliders.push(box);
        wallMeshes.push(wall);
        chunkWalls.push(wall);
    }
    
    scene.add(grp);
    chunks.set(key, { mesh: grp, colliders: chunkColliders, walls: chunkWalls });
}

window.createChunk = createChunk;

function spawnEnemy() {
    const angle = Math.random() * Math.PI * 2;
    const radius = 30 + Math.random() * 20;
    const x = player.pos.x + Math.cos(angle)*radius;
    const z = player.pos.z + Math.sin(angle)*radius;

    const tier = Math.random();
    let type = 0; 
    if(tier > 0.6) type = 1;
    if(tier > 0.9) type = 2;

    let geo, color, hp, speed, scale, points;

    if(type === 0) { 
        geo = new THREE.TetrahedronGeometry(1.0);
        color = 0xff0055; hp = 3; speed = 14; scale = 1; points = 100;
    } else if (type === 1) { 
        geo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        color = 0x00ff88; hp = 8; speed = 9; scale = 1.2; points = 250;
    } else { 
        geo = new THREE.DodecahedronGeometry(1.2);
        color = 0x00ffff; hp = 20; speed = 5; scale = 1.5; points = 500;
    }

    const grp = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: color, wireframe: true });
    const core = new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({ color: color, transparent:true, opacity:0.3 }));
    core.scale.set(0.5,0.5,0.5);
    const wireMesh = new THREE.Mesh(geo, mat);
    grp.add(wireMesh, core);

    grp.position.set(x, 2, z);
    grp.scale.set(scale, scale, scale);
    
    grp.userData = { hp, maxHp: hp, speed, type, offset: Math.random()*100, points };

    grp.userData.box = new THREE.Box3();

    scene.add(grp);
    enemies.push(grp);
}

window.spawnEnemy = spawnEnemy;

function updateEnemies(dt) {
    if(enemies.length < CONFIG.maxEnemies && !player.dead) spawnEnemy();
    
    const dir = new THREE.Vector3();
    const eBox = new THREE.Box3();
    const raycaster = new THREE.Raycaster();
    const repel = new THREE.Vector3();

    for(let i=enemies.length-1; i>=0; i--) {
        const e = enemies[i];
        const dist = e.position.distanceTo(player.pos);

        if(shield.active && dist < CONFIG.shieldRadius) {
            repel.subVectors(e.position, player.pos);
            repel.y = 0;
            if(repel.lengthSq() < 0.0001) repel.set(Math.random()-0.5, 0, Math.random()-0.5);
            repel.normalize().multiplyScalar((CONFIG.shieldRadius - dist + 0.2) * 15 * dt);
            e.position.add(repel);
            e.lookAt(player.pos);
            continue;
        }

        e.children[0].rotation.y += dt * (e.userData.type === 0 ? 5 : 2); 
        e.children[0].rotation.z += dt * 2;
        e.position.y = 2.5 + Math.sin(clock.elapsedTime * 3 + e.userData.offset) * 0.5;

        const hpPercent = e.userData.hp / e.userData.maxHp;
        e.children[1].scale.setScalar(0.5 * hpPercent);

        if(dist > CONFIG.chunkSize * 3) { 
            scene.remove(e); 
            e.children.forEach(child => {
                if(child.geometry) child.geometry.dispose();
                if(child.material) child.material.dispose();
            });
            enemies.splice(i, 1); 
            continue; 
        }

        if(!player.dead) {
            if(dist > 2.5) {
                dir.subVectors(player.pos, e.position).normalize();
                
                raycaster.set(e.position, dir);
                const hits = raycaster.intersectObjects(wallMeshes);
                
                if(hits.length > 0 && hits[0].distance < 5) {
                    const avoidance = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0,1,0));
                    dir.add(avoidance.multiplyScalar(1.5)).normalize();
                }

                const moveVec = dir.multiplyScalar(e.userData.speed * dt);
                const nextPos = e.position.clone().add(moveVec);
                eBox.setFromCenterAndSize(nextPos, new THREE.Vector3(2, 2, 2));
                
                let collision = false;
                for(let c of colliders) if(c.intersectsBox(eBox)) { collision = true; break; }

                if(!collision) { 
                    e.position.add(moveVec); 
                    e.lookAt(player.pos); 
                } else {
                    e.position.x += moveVec.x * 0.2; 
                    e.position.z += moveVec.z * 0.2;
                }
            }

            if(dist < 3.5) {
                const damage = (e.userData.type === 2 ? 60 : 30) * dt;
                player.hp -= damage; 
                player.lastDamageTime = Date.now();
                player.killStreak = 0; 
                
                if(player.hp < 0) player.hp = 0;
                updateHUD();
                addTrauma(0.5 * dt);
                
                const damagePercent = (player.maxHp - player.hp) / player.maxHp;
                document.getElementById('damage-fx').style.opacity = Math.min(0.8, damagePercent);
                
                if(player.hp <= 0 && !player.dead) gameOver();
            }
        }
    }
}

window.updateEnemies = updateEnemies;

function addTrauma(amount) {
    if(player.vel.length() > CONFIG.wallBreakSpeed) return;
    cameraShake = Math.min(cameraShake + amount, 1.0);
}

window.addTrauma = addTrauma;

function performDash() {
    const now = Date.now();
    if(now - player.lastDash < CONFIG.dashCooldown) return;
    
    player.lastDash = now;
    
    const forward = new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0), camRot.y);
    const right = new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), camRot.y);
    
    const dashDir = new THREE.Vector3();
    if(input.w) dashDir.add(forward); if(input.s) dashDir.sub(forward);
    if(input.d) dashDir.add(right); if(input.a) dashDir.sub(right);
    if(dashDir.length() === 0) dashDir.copy(forward);
    dashDir.normalize();

    player.vel.x = dashDir.x * CONFIG.dashForce; 
    player.vel.z = dashDir.z * CONFIG.dashForce;
    player.vel.y = 2; 

    camera.fov = player.baseFov + 40;
    camera.updateProjectionMatrix();

    weaponBody.material.opacity = 0.3;
    weaponBody.material.transparent = true;
    setTimeout(() => { 
        weaponBody.material.opacity = 1; 
        weaponBody.material.transparent = false; 
    }, 300);

    spawnParticles(player.pos, 15, 0x00ffff, true);
    playSound('dash'); 
    showMessage("DASH!", 300);
}

window.performDash = performDash;

function activateShield() {
    if(shield.active) return;
    if(Date.now() - shield.lastUsed < CONFIG.shieldCooldown) return;
    
    shield.active = true;
    shield.lastUsed = Date.now();
    shield.expires = Date.now() + CONFIG.shieldDuration;
    shield.state = 'building';
    shield.buildStart = Date.now();
    shield.buildDuration = 400;

    const size = CONFIG.shieldRadius * 2;
    const geo = new THREE.BoxGeometry(size, CONFIG.shieldHeight, size);
    const mat = new THREE.MeshStandardMaterial({ 
        color: CONFIG.shieldColor, 
        emissive: CONFIG.shieldColor, 
        emissiveIntensity: 0.5,
        transparent: true, 
        opacity: 0, 
        side: THREE.DoubleSide,
        roughness: 0.2,
        metalness: 0.7
    });
    const shell = new THREE.Mesh(geo, mat);

    const wireMat = new THREE.MeshBasicMaterial({ 
        color: CONFIG.shieldColor, 
        transparent: true, 
        opacity: 0, 
        wireframe: true,
        blending: THREE.AdditiveBlending
    });
    const wire = new THREE.Mesh(geo, wireMat);

    const innerCore = new THREE.Mesh(
        new THREE.OctahedronGeometry(1.5, 0),
        new THREE.MeshStandardMaterial({ 
            color: 0xffffff, 
            emissive: CONFIG.shieldColor, 
            emissiveIntensity: 0.8,
            transparent: true, 
            opacity: 0,
            roughness: 0.1,
            metalness: 0.9
        })
    );

    const group = new THREE.Group();
    group.add(shell);
    group.add(wire);
    group.add(innerCore);

    group.position.copy(player.pos);
    scene.add(group);

    shield.mesh = group;
    shield.shell = shell;
    shield.wire = wire;
    shield.innerCore = innerCore;

    spawnParticles(player.pos, 24, CONFIG.shieldColor, true);
    playSound('shield_on');
    showMessage('ENERGY SHIELD', 800);
}

window.activateShield = activateShield;

function updateShield(dt) {
    if(!shield.active || !shield.mesh) {
        if(!shield.mesh) shield.active = false;
        return;
    }

    shield.mesh.position.copy(player.pos);
    shield.mesh.position.y += CONFIG.shieldHeight / 2 - 1;
    shield.mesh.rotation.y += dt * 2;

    if(shield.state === 'building') {
        const elapsed = Date.now() - shield.buildStart;
        shield.buildProgress = Math.min(1, elapsed / shield.buildDuration);
        const eased = THREE.MathUtils.smoothstep(shield.buildProgress, 0, 1);

        if(shield.shell) {
            shield.shell.scale.setScalar(eased);
            shield.shell.material.opacity = THREE.MathUtils.lerp(0, CONFIG.shieldMaxOpacity, eased);
        }
        if(shield.wire) {
            shield.wire.scale.setScalar(eased);
            shield.wire.material.opacity = THREE.MathUtils.lerp(0, 0.85, eased);
        }
        if(shield.innerCore) {
            shield.innerCore.scale.setScalar(eased * 0.85);
            shield.innerCore.material.opacity = THREE.MathUtils.lerp(0, 0.2, eased);
        }
        if(shield.buildProgress < 1) return;
        shield.state = 'active';
        if(shield.shell) {
            shield.shell.material.opacity = CONFIG.shieldMinOpacity;
            shield.shell.material.emissiveIntensity = 0.9;
        }
        if(shield.innerCore) shield.innerCore.material.opacity = 0.18;

        vaporizeEnemiesInside(true);
    }

    const timeLeft = Math.max(shield.expires - Date.now(), 0);
    const pulse = 0.14 + Math.sin(clock.elapsedTime * 4) * 0.06;
    const opacity = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(timeLeft, 0, CONFIG.shieldDuration, CONFIG.shieldMinOpacity, CONFIG.shieldMaxOpacity) + pulse * 0.15, CONFIG.shieldMinOpacity, CONFIG.shieldMaxOpacity);

    if(shield.shell) {
        shield.shell.material.opacity = opacity;
        shield.shell.material.emissiveIntensity = 0.9 + pulse * 1.4;
        shield.shell.scale.setScalar(1 + pulse * 0.15);
    }
    if(shield.innerCore) {
        shield.innerCore.material.opacity = 0.12 + pulse * 0.15;
        shield.innerCore.rotation.y += dt * 1.5;
    }

    if(Date.now() >= shield.expires) explodeShield();
}

window.updateShield = updateShield;

function removeShieldMesh() {
    if(!shield.mesh) return;

    shield.mesh.children.forEach(child => {
        if(child.geometry) child.geometry.dispose();
        if(child.material) child.material.dispose();
    });

    scene.remove(shield.mesh);
    shield.mesh = null;
    shield.shell = null;
    shield.wire = null;
    shield.innerCore = null;
}

window.removeShieldMesh = removeShieldMesh;

function explodeShield() {
    if(!shield.active) return;
    shield.active = false;

    removeShieldMesh();

    spawnParticles(player.pos, 45, CONFIG.shieldColor, true);
    playSound('shield_burst');
    globalThis.showFloatingText('SHIELD BURST!', null);

    vaporizeEnemiesInside();
}

window.explodeShield = explodeShield;

function explodeRocket(pos) {
    spawnParticles(pos, 40, 0xff6633, true);
    spawnPrismBurst(pos);
    playSound('smash');
    addTrauma(1.2);
    
    if(player.pos.distanceTo(pos) <= CONFIG.rocketExplosionRadius) {
        const knockback = new THREE.Vector3().subVectors(player.pos, pos).normalize().multiplyScalar(CONFIG.rocketSelfKnockback);
        player.vel.add(knockback);
        player.hp -= 15;
        updateHUD();
        document.getElementById('damage-fx').style.opacity = '0.6';
        setTimeout(() => {
            document.getElementById('damage-fx').style.opacity = '0';
        }, 300);
    }
    
    for(let i=enemies.length-1; i>=0; i--) {
        const enemy = enemies[i];
        if(enemy.position.distanceTo(pos) <= CONFIG.rocketExplosionRadius) {
            const damage = CONFIG.rocketDamage * (1 - enemy.position.distanceTo(pos) / CONFIG.rocketExplosionRadius);
            enemy.userData.hp -= damage;
            if(enemy.userData.hp <= 0) {
                handleEnemyDeath(i, 0xff6633);
            } else {
                spawnParticles(enemy.position, 8, 0xff6633);
            }
        }
    }
    
    for(let i=wallMeshes.length-1; i>=0; i--) {
        const wall = wallMeshes[i];
        if(wall.position.distanceTo(pos) <= CONFIG.rocketExplosionRadius && wall.userData.isBreakable) {
            spawnParticles(wall.position, 20, 0xff6633, true);
            scene.remove(wall);
            wallMeshes.splice(i, 1);
            colliders.splice(colliders.indexOf(wall.userData.box), 1);
        }
    }
}

function vaporizeEnemiesInside(initial = false) {
    const radius = CONFIG.shieldRadius + 0.2;
    const shieldPos = shield.mesh ? shield.mesh.position.clone() : player.pos.clone();
    
    for(let i=enemies.length-1; i>=0; i--) {
        const enemy = enemies[i];
        if(!enemy) continue;
        
        const enemyWorldPos = enemy.position.clone();
        if(enemyWorldPos.distanceTo(shieldPos) <= radius) {
            spawnPrismBurst(enemyWorldPos);
            showFloatingText(initial ? 'ENTRAP!' : 'VAPORIZED!', null);
            handleEnemyDeath(i, CONFIG.shieldColor);
        }
    }
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

    // Shotgun jump boost
    if(w.name === 'Shotgun' && player.onGround) {
        const backward = new THREE.Vector3(0,0,1).applyQuaternion(camera.quaternion);
        backward.y = 0.3;
        backward.normalize().multiplyScalar(3);
        player.vel.add(backward);
        spawnParticles(player.pos.clone().add(new THREE.Vector3(0, -1, 0)), 8, 0x00ffff, true);
        addTrauma(0.3);
    }

    for(let i=0; i<w.count; i++) {
        let proj, vel, life;
        
        if(w.projectile === 'rocket') {
            const rocketGeo = new THREE.CylinderGeometry(0.15, 0.25, 0.8, 8);
            const rocketMat = new THREE.MeshStandardMaterial({ 
                color: w.color, 
                emissive: w.color, 
                emissiveIntensity: 0.3,
                metalness: 0.8,
                roughness: 0.2
            });
            proj = new THREE.Mesh(rocketGeo, rocketMat);
            
            const trailLight = new THREE.PointLight(w.color, 1.5, 4);
            trailLight.position.z = -0.4;
            proj.add(trailLight);
            
            const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
            dir.x += (Math.random() - 0.5) * w.spread;
            dir.y += (Math.random() - 0.5) * w.spread;
            dir.normalize();
            
            proj.rotation.copy(camera.rotation);
            vel = dir.multiplyScalar(CONFIG.rocketSpeed);
            life = 3.0;
            
            proj.userData = { type: 'rocket', light: trailLight };
        } else {
            proj = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1), new THREE.MeshBasicMaterial({color: w.color}));
            const dir = new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
            dir.x += (Math.random() - 0.5) * w.spread;
            dir.y += (Math.random() - 0.5) * w.spread;
            dir.normalize();
            vel = dir.multiplyScalar(150);
            life = 1.5;
            proj.userData = { type: 'bullet' };
        }

        proj.position.copy(camera.position).add(vel.clone().normalize().multiplyScalar(0.5)).add(new THREE.Vector3(0, -0.15, 0));
        proj.quaternion.copy(camera.quaternion);
        
        scene.add(proj);
        projectiles.push({ mesh: proj, vel: vel, life: life, damage: w.damage, weapon: w.projectile || 'bullet' });
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
        pBox.setFromObject(p.mesh);

        for(let j=enemies.length-1; j>=0; j--) {
            const e = enemies[j];
            eBox.setFromCenterAndSize(e.position, new THREE.Vector3(2,2,2)); 
            if(eBox.intersectsBox(pBox)) {
                hit = true; 
                e.userData.hp -= p.damage;
                spawnParticles(p.mesh.position, 3, 0x00ffff);
                playSound('hit');
                
                const hm = document.getElementById('hitmarker');
                hm.style.opacity = 1; 
                hm.style.transform = "translate(-50%, -50%) scale(1.3) rotate(10deg)";
                setTimeout(() => { 
                    hm.style.opacity = 0; 
                    hm.style.transform = "translate(-50%, -50%) scale(1)"; 
                }, 100);

                if(e.userData.hp <= 0) {
                    handleEnemyDeath(j, 0x00ffff, p.weapon);
                }
                break;
            }
        }
        
        if(!hit) {
            for(let c of colliders) {
                if(c.intersectsBox(pBox)) { 
                    hit=true; 
                    spawnParticles(p.mesh.position, 2, 0xffaa00);
                    // Add bullet hole
                    if(p.weapon !== 'rocket') {
                        addBulletHole(p.mesh.position.clone());
                    }
                    break; 
                }
            }
        }
        
        if(hit || p.life <= 0) { 
            if(p.weapon === 'rocket') {
                explodeRocket(p.mesh.position);
            }
            scene.remove(p.mesh);
            if(p.mesh.userData.light) {
                p.mesh.remove(p.mesh.userData.light);
            }
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            projectiles.splice(i, 1); 
        }
    }
}

function spawnParticles(pos, count, color, isExplosion = false) {
    const geometries = [ new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.TetrahedronGeometry(0.3) ];
    for(let i=0; i<count; i++) {
        const geo = geometries[Math.floor(Math.random() * geometries.length)];
        const mat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: color, emissiveIntensity: 2, roughness: 0.1 });

        const mesh = new THREE.Mesh(geo, mat);

        const spread = isExplosion ? 1.5 : 0.5;
        mesh.position.copy(pos).add(new THREE.Vector3((Math.random()-.5)*spread, (Math.random()-.5)*spread, (Math.random()-.5)*spread));
        mesh.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        scene.add(mesh);
        particles.push({ 
            mesh, 
            vel: new THREE.Vector3((Math.random()-.5) * (isExplosion?30:10), (Math.random()-.5) * (isExplosion?30:10) + 5, (Math.random()-.5) * (isExplosion?30:10)), 
            rotVel: { x: (Math.random()-.5)*10, y: (Math.random()-.5)*10 },
            life: 1.0, 
            startScale: 1.0
        });
        trimParticles();
    }
}

function spawnPrismBurst(pos) {
    for(let i=0; i<6; i++) {
        const shard = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.5, 0),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent:true, opacity:0.9, blending:THREE.AdditiveBlending })
        );
        shard.position.copy(pos);
        shard.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, Math.random()*Math.PI);
        scene.add(shard);
        particles.push({
            mesh: shard,
            vel: new THREE.Vector3(Math.random()-0.5, Math.random()*1.5, Math.random()-0.5).normalize().multiplyScalar(25),
            rotVel: { x: (Math.random()-0.5)*8, y: (Math.random()-0.5)*8 },
            life: 0.6,
            startScale: 1.5
        });
    }
}

function trimParticles() {
    while(particles.length > CONFIG.maxParticles) {
        const old = particles.shift();
        if(!old) break;
        scene.remove(old.mesh);
        if(old.mesh.geometry) old.mesh.geometry.dispose();
        if(old.mesh.material) old.mesh.material.dispose();
    }
}

function addBulletHole(pos) {
    const hole = new THREE.Mesh(
        new THREE.PlaneGeometry(0.15, 0.15),
        new THREE.MeshBasicMaterial({ 
            color: 0x333333, 
            transparent: true, 
            opacity: 0.8,
            side: THREE.DoubleSide
        })
    );
    hole.position.copy(pos);
    hole.userData.life = 10.0;
    scene.add(hole);
    bulletHoles.push(hole);
    
    if(bulletHoles.length > 50) {
        const old = bulletHoles.shift();
        scene.remove(old);
        old.geometry.dispose();
        old.material.dispose();
    }
}

function updateBulletHoles(dt) {
    for(let i=bulletHoles.length-1; i>=0; i--) {
        const hole = bulletHoles[i];
        hole.userData.life -= dt;
        hole.material.opacity = Math.max(0, hole.userData.life / 10.0 * 0.8);
        
        if(hole.userData.life <= 0) {
            scene.remove(hole);
            hole.geometry.dispose();
            hole.material.dispose();
            bulletHoles.splice(i, 1);
        }
    }
}

function updateSpeedRings(dt) {
    for(let i=speedRings.length-1; i>=0; i--) {
        const ring = speedRings[i];
        ring.userData.life -= dt;
        const lifeProgress = Math.max(0, 1 - ring.userData.life / 0.6);
        const scale = 1 + lifeProgress * ring.userData.scaleSpeed * 0.1;
        ring.scale.setScalar(scale);
        ring.material.opacity = Math.max(0, ring.userData.life);
        if(ring.userData.life <= 0) {
            scene.remove(ring);

            ring.geometry.dispose();
            ring.material.dispose();
            speedRings.splice(i, 1);
        }
    }
}

function spawnSpeedRing(position) {
    if(speedRings.length >= CONFIG.speedRingMax) return;
    const ringGeo = new THREE.RingGeometry(0.5, 0.6, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x55ffff, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(position);
    ring.position.y = 0.2;
    ring.userData.life = 0.6;
    ring.userData.scaleSpeed = 12;
    scene.add(ring);
    speedRings.push(ring);
}

function updatePhysics(dt) {
    if(player.dead) return;

    if(Date.now() - player.lastDamageTime > CONFIG.regenDelay && player.hp < player.maxHp) {
        player.hp += dt * 20; 
        if(player.hp > player.maxHp) player.hp = player.maxHp;
        updateHUD();
        document.getElementById('damage-fx').style.opacity = 0;
    }

    if(cameraShake > 0) {
        cameraShake -= dt * 2; 
        if(cameraShake<0) cameraShake=0;
        const amt = cameraShake*cameraShake * 0.5;
        camera.position.add(new THREE.Vector3((Math.random()-.5)*amt, (Math.random()-.5)*amt, (Math.random()-.5)*amt));
    }
    camera.rotation.set(camRot.x, camRot.y, 0, 'YXZ');

    const speed = new THREE.Vector3(player.vel.x, 0, player.vel.z).length();
    
    if(speed > player.highestSpeed) player.highestSpeed = speed;
    
    const speedBonus = Math.min(CONFIG.maxFovBonus, speed * 0.5);
    const targetFov = player.baseFov + speedBonus;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 4);
    camera.updateProjectionMatrix();

    const pulse = Math.sin(clock.elapsedTime * 10) * 0.05; 
    weaponGroup.scale.set(1+pulse, 1+pulse, 1);
    
    weaponSway.x = THREE.MathUtils.lerp(weaponSway.x, input.mouseX * -0.003, 0.1);
    weaponSway.y = THREE.MathUtils.lerp(weaponSway.y, input.mouseY * -0.003, 0.1);
    
    if(recoil > 0) recoil -= dt * 3; else recoil = 0;
    
    weaponGroup.position.set(
        0.3 + weaponSway.x, 
        -0.25 + weaponSway.y + Math.sin(clock.elapsedTime*12)*(speed>1?0.02:0.005), 
        -0.5 + recoil
    );
    weaponGroup.rotation.z = weaponSway.x * 2;

    input.mouseX = 0; input.mouseY = 0;

    const forward = new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0), camRot.y);
    const right = new THREE.Vector3(1,0,0).applyAxisAngle(new THREE.Vector3(0,1,0), camRot.y);
    const wishDir = new THREE.Vector3();
    if(input.w) wishDir.add(forward); if(input.s) wishDir.sub(forward);
    if(input.d) wishDir.add(right); if(input.a) wishDir.sub(right);
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
        player.vel.y = CONFIG.jumpForce;
        player.onGround = false;
        spawnParticles(player.pos.clone().sub(new THREE.Vector3(0,2,0)), 2, 0xffffff);
    }

    const nextPos = player.pos.clone().add(player.vel.clone().multiplyScalar(dt));
    
    const pBox = new THREE.Box3();
    pBox.setFromCenterAndSize(new THREE.Vector3(nextPos.x, player.pos.y, player.pos.z), new THREE.Vector3(0.5, 1.8, 0.5));
    
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
            showFloatingText(["SMASH!", "BOOM!", "UNSTOPPABLE!"][Math.floor(Math.random()*3)], null);
            addTrauma(0.5);
            
            if(hitWall.geometry) hitWall.geometry.dispose();
            if(hitWall.material) hitWall.material.dispose();
            
            scene.remove(hitWall);
            wallMeshes.splice(wallMeshes.indexOf(hitWall), 1);
            colliders.splice(colliders.indexOf(hitWall.userData.box), 1);
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
            spawnParticles(hitWall.position, 30, 0xff0055, true);
            playSound('smash');
            showFloatingText("WALL BREAKER!", null);
            addTrauma(0.5);
            
            if(hitWall.geometry) hitWall.geometry.dispose();
            if(hitWall.material) hitWall.material.dispose();
            
            scene.remove(hitWall);
            wallMeshes.splice(wallMeshes.indexOf(hitWall), 1);
            colliders.splice(colliders.indexOf(hitWall.userData.box), 1);
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
    if(speed > CONFIG.speedShakeThreshold) {
        if(Date.now() - lastSpeedRing > CONFIG.speedRingInterval) {
            spawnSpeedRing(player.pos.clone());
            lastSpeedRing = Date.now();
        }
    }

    const speedDisplay = document.getElementById('speed-val');
    speedDisplay.innerText = Math.round(speed);
    if(speed > CONFIG.wallBreakSpeed) {
        speedDisplay.style.color = '#f0f';
        speedDisplay.style.textShadow = '0 0 20px #f0f';
    } else {
        speedDisplay.style.color = '#fff';
        speedDisplay.style.textShadow = 'none';
    }
}

function gameOver() {
    player.dead = true;
    document.exitPointerLock();
    shield.active = false;
    removeShieldMesh();
    
    const title = document.getElementById('menu-title');
    title.innerHTML = `ÖLDÜN<br><span style="font-size:40px;">Skor: ${player.score} | En Yüksek Hız: ${Math.round(player.highestSpeed)}</span>`;
    
    document.getElementById('start-btn').innerText = "TEKRAR OYNA";
    document.getElementById('menu').style.display = 'flex';
}

function onKey(e, v) {
    const k = e.key.toLowerCase();
    if(k==='w') input.w=v; if(k==='s') input.s=v; if(k==='a') input.a=v; if(k==='d') input.d=v;
    if(k===' ') input.space=v;
    if(k==='shift' && v===1) performDash();
    if(k==='x' && v===1) activateShield();
    if(v===1) {
        if(k==='1') { player.weaponIdx = 0; updateWeaponVisuals(); }
        if(k==='2') { player.weaponIdx = 1; updateWeaponVisuals(); }
        if(k==='3') { player.weaponIdx = 2; updateWeaponVisuals(); }
    }
}

function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.1);

    updateChunks();
    updatePhysics(dt);
    updateShield(dt);
    updateEnemies(dt);
    updateProjectiles(dt);
    updateBulletHoles(dt);
    updateNeonWorld(dt);
    updateSpeedRings(dt);
    
    for(let i=particles.length-1; i>=0; i--) {
        const p = particles[i];
        p.life -= dt * 1.5; 
        p.vel.y -= 25 * dt;
        p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
        p.mesh.rotation.x += p.rotVel.x * dt;
        p.mesh.rotation.y += p.rotVel.y * dt;
        p.mesh.scale.setScalar(Math.max(0, p.life * p.startScale));
        
        if(p.life <= 0) { 
            scene.remove(p.mesh); 
            p.mesh.geometry.dispose(); 
            p.mesh.material.dispose(); 
            particles.splice(i, 1); 
        }
    }
    
    composer.render();
}

window.onload = init;
