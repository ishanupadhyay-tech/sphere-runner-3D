// --- GAME STATES & VARIABLES ---
const STATES = { LOBBY: 'LOBBY', PLAYING: 'PLAYING', GAMEOVER: 'GAMEOVER' };
let currentState = STATES.LOBBY;

let scene, camera, renderer;
let player, track;
let obstacles = [];
let trackWidth = 10;
let trackLength = 100;
let gameSpeed = 0.5;
let score = 0;

// Input Tracking
const keys = { Left: false, Right: false };
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const skinColors = [0x00d2ff, 0xff007f, 0x00ffcc, 0xffcc00, 0x9b59b6];
let colorIndex = 0;

// --- 1. SETUP CORE SCENE ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.FogExp2(0x1a1a2e, 0.015);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    setLobbyCamera();

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // --- LIGHTS ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // --- ENVIRONMENT (THE TRACK) ---
    const trackGeo = new THREE.BoxGeometry(trackWidth, 0.5, trackLength);
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x4e54c8, roughness: 0.4 });
    track = new THREE.Mesh(trackGeo, trackMat);
    track.position.set(0, -0.25, -trackLength / 2 + 5);
    track.receiveShadow = true;
    scene.add(track);

    // --- PLAYER (SPHERE) ---
    const playerGeo = new THREE.SphereGeometry(0.6, 32, 32);
    const playerMat = new THREE.MeshStandardMaterial({ color: skinColors[colorIndex], roughness: 0.1, metalness: 0.5 });
    player = new THREE.Mesh(playerGeo, playerMat);
    player.castShadow = true;
    scene.add(player);
    resetPlayerPosition();

    // --- SPAWN OBSTACLES ---
    spawnObstaclesPool();

    // --- EVENT LISTENERS ---
    window.addEventListener('keydown', (e) => handleInputs(e, true));
    window.addEventListener('keyup', (e) => handleInputs(e, false));
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('click', onLobbyClick); // Catch mouse target intersections

    // --- MOBILE TOUCH CONTROLS ---
    window.addEventListener('touchstart', (e) => {
        if (currentState !== STATES.PLAYING) return;
        
        // Get the X coordinate of the first touch
        const touchX = e.touches[0].clientX;
        const screenWidth = window.innerWidth;

        // If touched on the left half of the screen
        if (touchX < screenWidth / 2) {
            keys.Left = true;
            keys.Right = false;
        } else { // If touched on the right half
            keys.Right = true;
            keys.Left = false;
        }
    });

    // Stop moving when the finger is lifted off the screen
    window.addEventListener('touchend', () => {
        keys.Left = false;
        keys.Right = false;
    });
    
    document.getElementById('start-btn').addEventListener('click', startGame);

    // Start Engine Loop
    animate();
}

// --- LOBBY MINI GAME: INTUITIVE MOUSE RAYCASTING ---
function onLobbyClick(event) {
    if (currentState !== STATES.LOBBY) return;

    // Convert flat screen coordinates into normal -1 to +1 WebGL coordinates
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(player);

    // Check if player click touches the sphere model boundary
    if (intersects.length > 0) {
        colorIndex = (colorIndex + 1) % skinColors.length;
        player.material.color.setHex(skinColors[colorIndex]);
        
        // Add a little dynamic scale bounce feedback
        player.scale.set(1.3, 1.3, 1.3);
    }
}

// --- STATE MANAGEMENT ---
function setLobbyCamera() {
    camera.position.set(2, 2.5, 4);
    camera.lookAt(0, 0.6, 0);
}

function setGameplayCamera() {
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, -10);
}

function resetPlayerPosition() {
    player.position.set(0, 0.6, 0);
}

function spawnObstaclesPool() {
    obstacles.forEach(obs => scene.remove(obs));
    obstacles = [];

    for (let i = 0; i < 15; i++) {
        const size = Math.random() * 0.8 + 0.6;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff416c, roughness: 0.3 });
        const obstacle = new THREE.Mesh(geo, mat);

        obstacle.position.set((Math.random() - 0.5) * (trackWidth - 1), size / 2, -30 - i * 15);
        obstacle.castShadow = true;
        
        scene.add(obstacle);
        obstacles.push(obstacle);
    }
}

function startGame() {
    document.getElementById('lobby-screen').style.display = 'none';
    document.getElementById('score-board').style.display = 'block';
    
    score = 0;
    gameSpeed = 0.5;
    document.getElementById('score').innerText = score;
    resetPlayerPosition();
    spawnObstaclesPool();
    setGameplayCamera();
    
    currentState = STATES.PLAYING;
}

// --- CONTROLS & RESIZE ---
function handleInputs(event, isPressed) {
    if (currentState !== STATES.PLAYING) return;
    if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') keys.Left = isPressed;
    if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') keys.Right = isPressed;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- ENGINE REFRESH LOOP ---
function animate() {
    requestAnimationFrame(animate);

    if (currentState === STATES.LOBBY) {
        player.rotation.y += 0.01;
        player.position.y = 0.6 + Math.sin(Date.now() * 0.003) * 0.1;
        
        // Return click scale back down smoothly
        player.scale.x = THREE.MathUtils.lerp(player.scale.x, 1, 0.1);
        player.scale.y = THREE.MathUtils.lerp(player.scale.y, 1, 0.1);
        player.scale.z = THREE.MathUtils.lerp(player.scale.z, 1, 0.1);
    } 
    else if (currentState === STATES.PLAYING) {
        if (keys.Left && player.position.x > -trackWidth / 2 + 0.6) player.position.x -= 0.15;
        if (keys.Right && player.position.x < trackWidth / 2 - 0.6) player.position.x += 0.15;

        obstacles.forEach((obs) => {
            obs.position.z += gameSpeed;
            obs.rotation.x += 0.02;

            const playerBox = new THREE.Box3().setFromObject(player);
            const obsBox = new THREE.Box3().setFromObject(obs);

            if (playerBox.intersectsBox(obsBox)) {
                triggerGameOver();
            }

            if (obs.position.z > 10) {
                obs.position.z = -200;
                obs.position.x = (Math.random() - 0.5) * (trackWidth - 1);
                score += 10;
                document.getElementById('score').innerText = score;

                if (score % 50 === 0) gameSpeed += 0.05;
            }
        });

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, player.position.x, 0.05);
    }

    renderer.render(scene, camera);
}

// --- GAME OVER HOOK ---
function triggerGameOver() {
    currentState = STATES.GAMEOVER;
    document.getElementById('game-over').style.display = 'block';
    
    setTimeout(() => {
        document.getElementById('game-over').style.display = 'none';
        document.getElementById('score-board').style.display = 'none';
        document.getElementById('lobby-screen').style.display = 'block';
        
        setLobbyCamera();
        resetPlayerPosition();
        currentState = STATES.LOBBY;
    }, 2000);
}

window.onload = init;
