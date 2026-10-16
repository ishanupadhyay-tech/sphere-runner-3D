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

// User Session Variables
let currentUser = null;
let userHighScore = 0;

// Upgraded Movement & Velocity Variables
let playerVelocityX = 0;
const playerAcceleration = 0.08;
const playerDamping = 0.75;
const maxSpeed = 0.3;

// Input Tracking
const keys = { Left: false, Right: false };
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const skinColors = [0x00d2ff, 0xff007f, 0x00ffcc, 0xffcc00, 0x9b59b6];
let colorIndex = 0;

// Reusable bounding boxes to eliminate lag
const playerBox = new THREE.Box3();
const obsBox = new THREE.Box3();

// --- AUTHENTICATION & INITIALIZATION SYSTEM ---
document.addEventListener('DOMContentLoaded', () => {
    const loginBtn = document.getElementById('login-btn');
    const usernameInput = document.getElementById('username-input');
    const passwordInput = document.getElementById('password-input');
    const errorMsg = document.getElementById('auth-error');

    loginBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!username || !password) {
            errorMsg.innerText = "Please fill in all fields.";
            return;
        }

        // Retrieve user database from localStorage
        let usersDB = JSON.parse(localStorage.getItem('sphere_runner_users')) || {};

        if (usersDB[username]) {
            // Existing Account: Check Password
            if (usersDB[username].password === password) {
                currentUser = username;
                userHighScore = usersDB[username].highScore || 0;
                launchLobbySession();
            } else {
                errorMsg.innerText = "Incorrect password for this username.";
            }
        } else {
            // New Account Registration: Enforce Strict Password Criteria
            const hasCapital = /[A-Z]/.test(password);
            const hasSmall = /[a-z]/.test(password);
            const hasNumber = /[0-9]/.test(password);
            const hasSymbol = /[^A-Za-z0-9]/.test(password);
            const isValidLength = password.length >= 6;

            if (!hasCapital || !hasSmall || !hasNumber || !hasSymbol || !isValidLength) {
                errorMsg.innerText = "Password must have A-Z, a-z, 0-9 & a symbol (min 6 chars).";
                return;
            }

            // Save new user to database
            usersDB[username] = { password: password, highScore: 0 };
            localStorage.setItem('sphere_runner_users', JSON.stringify(usersDB));

            currentUser = username;
            userHighScore = 0;
            launchLobbySession();
        }
    });
});

function launchLobbySession() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('lobby-screen').style.display = 'block';
    
    const userHud = document.getElementById('user-hud');
    userHud.style.display = 'block';
    userHud.innerHTML = `👤 ${currentUser} | Best: <span id="best-score">${userHighScore}</span>`;
    
    init();
}

// --- 1. SETUP CORE SCENE ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e1e2f);
    scene.fog = new THREE.FogExp2(0x1e1e2f, 0.015);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    setLobbyCamera();

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // --- LIGHTS ---
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 512;
    dirLight.shadow.mapSize.height = 512;
    scene.add(dirLight);

    // --- ENVIRONMENT (THE TRACK) ---
    const trackGeo = new THREE.BoxGeometry(trackWidth, 0.5, trackLength);
    const trackMat = new THREE.MeshStandardMaterial({ color: 0x4e54c8, roughness: 0.4 });
    track = new THREE.Mesh(trackGeo, trackMat);
    track.position.set(0, -0.25, -trackLength / 2 + 5);
    track.receiveShadow = true;
    scene.add(track);

    // --- PLAYER (SPHERE) ---
    const playerGeo = new THREE.SphereGeometry(0.6, 16, 16);
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
    window.addEventListener('click', onLobbyClick);

    // Safety fix against ghost inputs
    window.addEventListener('blur', () => {
        keys.Left = false;
        keys.Right = false;
        playerVelocityX = 0;
    });

    window.addEventListener('touchstart', (e) => {
        if (currentState !== STATES.PLAYING) return;
        const touchX = e.touches[0].clientX;
        keys.Left = touchX < window.innerWidth / 2;
        keys.Right = touchX >= window.innerWidth / 2;
    });

    window.addEventListener('touchend', (e) => {
        if (e.touches.length === 0) {
            keys.Left = false;
            keys.Right = false;
        }
    });
    
    document.getElementById('start-btn').addEventListener('click', startGame);

    animate();
}

function onLobbyClick(event) {
    if (currentState !== STATES.LOBBY) return;

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObject(player);

    if (intersects.length > 0) {
        colorIndex = (colorIndex + 1) % skinColors.length;
        player.material.color.setHex(skinColors[colorIndex]);
        player.scale.set(1.3, 1.3, 1.3);
    }
}

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
    playerVelocityX = 0;
    keys.Left = false;
    keys.Right = false;
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

function animate() {
    requestAnimationFrame(animate);

    if (currentState === STATES.LOBBY) {
        player.rotation.y += 0.01;
        player.position.y = 0.6 + Math.sin(Date.now() * 0.003) * 0.1;
        
        player.scale.x = THREE.MathUtils.lerp(player.scale.x, 1, 0.1);
        player.scale.y = THREE.MathUtils.lerp(player.scale.y, 1, 0.1);
        player.scale.z = THREE.MathUtils.lerp(player.scale.z, 1, 0.1);
    } 
    else if (currentState === STATES.PLAYING) {
        if (keys.Left) playerVelocityX -= playerAcceleration;
        if (keys.Right) playerVelocityX += playerAcceleration;

        playerVelocityX *= playerDamping;
        playerVelocityX = Math.max(Math.min(playerVelocityX, maxSpeed), -maxSpeed);

        player.position.x += playerVelocityX;

        // Clean boundary clamping
        const halfWidth = trackWidth / 2 - 0.6;
        if (player.position.x < -halfWidth) {
            player.position.x = -halfWidth;
            playerVelocityX = 0;
        } else if (player.position.x > halfWidth) {
            player.position.x = halfWidth;
            playerVelocityX = 0;
        }

        playerBox.setFromObject(player);

        obstacles.forEach((obs) => {
            obs.position.z += gameSpeed;
            obs.rotation.x += 0.02;

            obsBox.setFromObject(obs);

            if (playerBox.intersectsBox(obsBox)) {
                triggerGameOver();
            }

            if (obs.position.z > 10) {
                obs.position.z = -200;
                obs.position.x = (Math.random() - 0.5) * (trackWidth - 1);
                score += 10;
                document.getElementById('score').innerText = score;

                // Auto-save high score check
                if (score > userHighScore) {
                    userHighScore = score;
                    document.getElementById('best-score').innerText = userHighScore;

                    let usersDB = JSON.parse(localStorage.getItem('sphere_runner_users')) || {};
                    if (usersDB[currentUser]) {
                        usersDB[currentUser].highScore = userHighScore;
                        localStorage.setItem('sphere_runner_users', JSON.stringify(usersDB));
                    }
                }

                if (score % 50 === 0) gameSpeed += 0.05;
            }
        });

        camera.position.x = THREE.MathUtils.lerp(camera.position.x, player.position.x, 0.05);
    }

    renderer.render(scene, camera);
}

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