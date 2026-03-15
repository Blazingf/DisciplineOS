import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

// ================================
// THREE.JS 3D BACKGROUND
// ================================
function init3D() {
  const container = document.getElementById('canvas-container');
  const scene = new THREE.Scene();
  
  // Camera
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 5;

  // Renderer
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Geometry (Icosahedron looks premium and abstract)
  const geometry = new THREE.IcosahedronGeometry(2, 0); // r=2, detail=0
  
  // Materials
  const themeColor = '#4a0a8a'; // Updated requested theme color
  
  // Wireframe material
  const material = new THREE.MeshBasicMaterial({ 
    color: themeColor, 
    wireframe: true,
    transparent: true,
    opacity: 0.6
  });
  
  // Inner solid material for depth
  const materialSolid = new THREE.MeshPhongMaterial({
    color: 0x13131c,
    transparent: true,
    opacity: 0.8
  });

  const meshWire = new THREE.Mesh(geometry, material);
  const meshSolid = new THREE.Mesh(geometry, materialSolid);
  
  scene.add(meshWire);
  scene.add(meshSolid);

  // Lighting
  const light = new THREE.DirectionalLight(0xffffff, 1);
  light.position.set(1, 1, 2);
  scene.add(light);
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
  scene.add(ambientLight);

  // Animation Loop
  // Mouse tracking to slightly rotate the mesh
  let mouseX = 0;
  let mouseY = 0;
  let targetX = 0;
  let targetY = 0;
  const windowHalfX = window.innerWidth / 2;
  const windowHalfY = window.innerHeight / 2;

  document.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX - windowHalfX) * 0.001;
    mouseY = (e.clientY - windowHalfY) * 0.001;
  });

  function animate() {
    requestAnimationFrame(animate);
    
    targetX = mouseX * 0.5;
    targetY = mouseY * 0.5;
    
    // Constant rotation
    meshWire.rotation.x += 0.002;
    meshWire.rotation.y += 0.003;
    meshSolid.rotation.x += 0.002;
    meshSolid.rotation.y += 0.003;

    // Mouse interactive rotation
    meshWire.rotation.x += 0.05 * (targetY - meshWire.rotation.x);
    meshWire.rotation.y += 0.05 * (targetX - meshWire.rotation.y);
    meshSolid.rotation.x += 0.05 * (targetY - meshSolid.rotation.x);
    meshSolid.rotation.y += 0.05 * (targetX - meshSolid.rotation.y);

    renderer.render(scene, camera);
  }

  // Handle Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

// ================================
// AUTHENTICATION LOGIC
// ================================

let isLoginMode = true;

document.addEventListener('DOMContentLoaded', () => {
  init3D();
  
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const btnSubmit = document.getElementById('btn-submit');
  const btnText = document.getElementById('btn-text');
  
  tabLogin.onclick = () => {
    isLoginMode = true;
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    btnText.innerText = 'SIGN IN';
    clearErrors();
  };

  tabRegister.onclick = () => {
    isLoginMode = false;
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    btnText.innerText = 'CREATE ACCOUNT';
    clearErrors();
  };

  // Toggle Password Visibility
  const togglePasswordBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('password');
  
  togglePasswordBtn.addEventListener('click', () => {
    const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
    passwordInput.setAttribute('type', type);
    // Switch the icon: you can use emojis or SVG. For now, simple text icons.
    togglePasswordBtn.innerText = type === 'password' ? '👁️' : '🙈';
  });
  
  // Execute handleAuth on Enter
  passwordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAuth();
  });
  document.getElementById('email').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAuth();
  });

  // Check if already logged in -> redirect
  const checkAuthInterval = setInterval(() => {
    if(window.firebaseAuth) {
      clearInterval(checkAuthInterval);
      onAuthStateChanged(window.firebaseAuth, (user) => {
        if (user) {
          window.location.href = './index.html';
        }
      });
    }
  }, 100);
});

function clearErrors() {
  document.getElementById('error-display').innerText = '';
}

function setLoading(isLoading) {
  const btnText = document.getElementById('btn-text');
  const btnSpinner = document.getElementById('btn-spinner');
  
  if(isLoading) {
    btnText.style.display = 'none';
    btnSpinner.style.display = 'block';
  } else {
    btnText.style.display = 'block';
    btnSpinner.style.display = 'none';
  }
}

async function handleAuth() {
  if(!window.firebaseAuth) {
    document.getElementById('error-display').innerText = "Firebase not configured. Add your config in login.html.";
    return;
  }

  const email = document.getElementById('email').value.trim();
  const pass = document.getElementById('password').value;
  
  // Basic Validations
  if(!email || !pass) {
    document.getElementById('error-display').innerText = "Please fill in all fields.";
    return;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if(!emailRegex.test(email)) {
    document.getElementById('error-display').innerText = "Please enter a valid email address.";
    return;
  }
  
  if(!isLoginMode && pass.length < 6) {
    document.getElementById('error-display').innerText = "Password must be at least 6 characters.";
    return;
  }

  setLoading(true);
  clearErrors();

  try {
    if (isLoginMode) {
      await signInWithEmailAndPassword(window.firebaseAuth, email, pass);
      // State change listener will redirect
    } else {
      await createUserWithEmailAndPassword(window.firebaseAuth, email, pass);
      // State change listener will redirect
    }
  } catch (err) {
    let friendlyError = "Authentication failed.";
    if (err.code === 'auth/invalid-credential') friendlyError = "Invalid email or password.";
    if (err.code === 'auth/email-already-in-use') friendlyError = "An account with this email already exists.";
    if (err.code === 'auth/weak-password') friendlyError = "Password is too weak.";
    
    document.getElementById('error-display').innerText = friendlyError;
    setLoading(false);
  }
}
