const firebaseConfig = {
  apiKey: "AIzaSyBhfQ1Wf5JEy6sOU4ExXboRI4Ir4y_aKZw",
  authDomain: "easy-chatroom.firebaseapp.com",
  databaseURL: "https://easy-chatroom-default-rtdb.firebaseio.com",
  projectId: "easy-chatroom",
  storageBucket: "easy-chatroom.firebasestorage.app",
  messagingSenderId: "985049198428",
  appId: "1:985049198428:web:d0eb7e2de39887710c9b99",
  measurementId: "G-QDESJ2WR42"
};
let lastVerificationCode = null;
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();
const db = firebase.database();
let deviceId = null; // default

(async () => {
  deviceId = await generateDeviceId();
})();

const swearWords = [
  // English
  "fuck", "shit", "bitch", "asshole", "bastard", "dick", "cunt",
  // Spanish
  "puta", "mierda", "pendejo", "coño", "cabron", "gilipollas",
  // Portuguese
  "porra", "caralho", "merda", "puta", "fdp", "otario",
  // Tagalog / Filipino
  "putangina", "gago", "tangina", "ulol", "bobo", "bwisit", "putang ina"
];

const style = document.createElement("style");
style.innerHTML = `
  .reaction-tray {
    display: none;
    position: absolute;
    background: #222;
    padding: 6px 8px;
    border-radius: 10px;
    font-size: 18px;
    top: -45px;
    left: 0;
    z-index: 10;
    white-space: nowrap;
    overflow-x: auto;
    max-width: 100%;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  }
  .reaction-tray::-webkit-scrollbar {
    height: 6px;
  }
  .reaction-tray::-webkit-scrollbar-thumb {
    background: #444;
    border-radius: 3px;
  }
  .reaction-tray button {
    display: inline-block;
    margin: 0 4px;
    font-size: 20px;
    background: none;
    border: none;
    cursor: pointer;
  }
`;
document.head.appendChild(style);
const userAvatars = {}; // usernameKey -> base64 avatar
let globalDevs = [];
let roomAdmins = [];
let roomModerators = [];
let notificationsEnabled = false;
let notificationStack = [];
let notificationTimer = null;
let roomUsers = {};
let userListReady = false;
let pendingMessages = [];
let messageTimestamps = [];
let isBlocked = false;
let username = null;
let roomCode = null;
let clientId = "_" + Math.random().toString(36).substr(2, 9);
let lastActivity = Date.now();
let typingTimeout;
let gr8stg = "";
const STATIC_ROOM = "050BBB66HH";
const MAX_MESSAGES = 250;

const sound = new Audio("sounds/beep.mp3");
sound.volume = 0.3;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let recordingTimer;
let isRoomAdmin = false;

let isRegisterMode = false;

// Helper to generate a simple device fingerprint
async function generateDeviceId() {
  const info = navigator.userAgent + screen.width + screen.height;
  const hash = await sha256(info);
  return '_' + hash.substr(0, 20);
}

// SHA256 function (Browser built-in crypto)
function sha256(str) {
  const buffer = new TextEncoder().encode(str);
  return crypto.subtle.digest('SHA-256', buffer).then(hash => {
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  });
}
function toggleNotifications() {
  if (Notification.permission !== "granted") {
    Notification.requestPermission().then(permission => {
      if (permission === "granted") {
        notificationsEnabled = true;
        localStorage.setItem("notifications_enabled", "true");
        document.getElementById("notifToggleBtn").innerText = "🔕 Disable Notifications";
      }
    });
  } else {
    notificationsEnabled = !notificationsEnabled;
    localStorage.setItem("notifications_enabled", notificationsEnabled ? "true" : "false");
    document.getElementById("notifToggleBtn").innerText = notificationsEnabled ? "🔕 Disable Notifications" : "🔔 Enable Notifications";
  }
}
function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;

  document.getElementById("authTitle").innerText = isRegisterMode ? "Register" : "Login";
  document.getElementById("authEmail").style.display = isRegisterMode ? "block" : "none";
  document.getElementById("sendCodeBtn").style.display = isRegisterMode ? "block" : "none";
  document.getElementById("authVerificationCode").style.display = isRegisterMode ? "block" : "none";
  document.getElementById("authPasswordConfirm").style.display = isRegisterMode ? "block" : "none";
  document.getElementById("authDescription").style.display = isRegisterMode ? "block" : "none";
  document.getElementById("authAvatar").style.display = isRegisterMode ? "block" : "none";
  document.getElementById("authAvatarPreview").style.display = "none";

  document.getElementById("authUsername").style.display = "block";
  document.getElementById("authSubmitBtn").innerText = isRegisterMode ? "Create Account" : "Login";
  document.getElementById("authError").style.display = "none";

  document.getElementById("toggleAuthMode").innerText = isRegisterMode
    ? "Already have an account? Login"
    : "Don't have an account? Register";
}
function previewAvatar() {
  const fileInput = document.getElementById("authAvatar");
  if (!fileInput.files.length) return;

  const reader = new FileReader();
  reader.onloadend = () => {
    document.getElementById("authAvatarPreview").src = reader.result;
    document.getElementById("authAvatarPreview").style.display = "block";
  };
  reader.readAsDataURL(fileInput.files[0]);
}
async function sendVerificationCode() {
  const email = document.getElementById('authEmail').value.trim();
  const usernameInput = document.getElementById('authUsername').value.trim();
  const errorDisplay = document.getElementById('authError');

  errorDisplay.style.display = 'none';

  if (!email || !usernameInput) {
    errorDisplay.innerText = "Enter email and username first.";
    errorDisplay.style.display = 'block';
    return;
  }
  const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
  lastVerificationCode = verificationCode;
  
  try {
    await emailjs.send('service_qfnrrrl', 'template_uadxvmp', {
      to_email: email,
      to_name: usernameInput,
      message: verificationCode
    }, 'c1EG9jBJFQSM_dFHY');
    alert("Verification code sent!");
    document.getElementById('authVerificationCode').style.display = 'block';

  } catch (err) {
    errorDisplay.innerText = "Error sending code. Check emailJS keys.";
    errorDisplay.style.display = 'block';
    console.error(err);
  }
}

async function submitAuth() {
  const email = document.getElementById('authEmail').value.trim();
  const usernameInput = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value.trim();
  const confirmPassword = document.getElementById('authPasswordConfirm').value.trim();
  const enteredCode = document.getElementById('authVerificationCode').value.trim();
  const errorDisplay = document.getElementById('authError');

  errorDisplay.style.display = 'none';

  if (isRegisterMode) {
    if (!email || !usernameInput || !password || !confirmPassword || !enteredCode) {
      errorDisplay.innerText = "Fill all fields.";
      errorDisplay.style.display = 'block';
      return;
    }

    if (password !== confirmPassword) {
      errorDisplay.innerText = "Passwords do not match.";
      errorDisplay.style.display = 'block';
      return;
    }

    if (enteredCode !== lastVerificationCode) {
      errorDisplay.innerText = "Invalid verification code.";
      errorDisplay.style.display = 'block';
      return;
    }

    try {
      const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;

      const sanitized = sanitizeUsername(usernameInput);
      await db.ref('users/' + sanitized).set({
        username: usernameInput,
        email: email,
        createdAt: Date.now()
      });

      await firebase.auth().signOut();
      alert("Account created! You may now login.");
      toggleAuthMode();

    } catch (err) {
      errorDisplay.innerText = err.message;
      errorDisplay.style.display = 'block';
    }

  } else {
    const usernameOnly = document.getElementById('authUsername').value.trim();
    if (!usernameOnly || !password) {
      errorDisplay.innerText = "Enter username and password.";
      errorDisplay.style.display = 'block';
      return;
    }

    try {
      const userSnap = await db.ref('users/' + sanitizeUsername(usernameOnly)).get();
      if (!userSnap.exists()) {
        throw new Error("Username not found.");
      }

      const userEmail = userSnap.val().email;
      const userCredential = await firebase.auth().signInWithEmailAndPassword(userEmail, password);
      const user = userCredential.user;

      if (!user.emailVerified) {
        await firebase.auth().signOut();
        throw new Error("Email not verified.");
      }

      username = usernameOnly;
      startAfterAuth();

    } catch (err) {
      errorDisplay.innerText = err.message;
      errorDisplay.style.display = 'block';
    }
  }
}
async function saveNewUser(user, passwordHash, deviceId, avatarBase64, description) {
  const authRef = db.ref(`auth/${sanitizeUsername(user)}`);
  const newUserData = {
    username: user,
    passwordHash: passwordHash,
    role: "user",
    deviceId: deviceId,
    description: description || "",
    avatarBase64: avatarBase64 || "",
    usernameHistory: [user],
    lastChanged: Date.now()
  };  

  await authRef.set(newUserData);
  
  username = user;
  avatarBase64 = newUserData.avatarBase64;
  userDescription = newUserData.description;

  startAfterAuth();
}
async function startAfterAuth() {
  const sanitized = sanitizeUsername(username);
  const authRef = db.ref(`auth/${sanitized}`);
  const snap = await authRef.get();

  if (snap.exists()) {
    const data = snap.val();
    username = data.username;
    userDescription = data.description || "";
    avatarBase64 = data.avatarBase64 || "";
    role = data.role || "user";

    // Apply Avatar if exists
    if (avatarBase64) {
      const sidebarAvatar = document.getElementById("sidebarAvatarPreview");
      sidebarAvatar.src = "data:image/png;base64," + avatarBase64;
      sidebarAvatar.style.display = "block";
    }
  } else {
    console.warn("User profile not found in auth database.");
  }
  await loadRoomRoles();
  document.getElementById("namePreview").innerText = username;
  showScreen("roomChoiceScreen");
}
function toggleRecording() {
  if (isRecording) {
    stopRecording();
  } else {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.start();
      isRecording = true;
      document.getElementById("recordBtn").innerText = "⏹️";

      audioChunks = [];

      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

      mediaRecorder.onstop = () => {
        clearTimeout(recordingTimer);
      
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
      
        reader.onloadend = () => {
          const base64Audio = reader.result.split(',')[1]; // Strip the prefix
      
          const key = db.ref().push().key;
          db.ref(`rooms/${roomCode}/messages/${key}`).set({
            msg: "[Voice message]",
            audioBase64: base64Audio,
            sender: username,
            senderId: clientId,
            timestamp: Date.now()
          });
        };
      
        reader.readAsDataURL(blob);
      };      

      // 🕒 Auto-stop after 20 seconds
      recordingTimer = setTimeout(() => {
        if (mediaRecorder && isRecording) {
          stopRecording();
        }
      }, 20000);
    }).catch(err => {
      alert("Microphone permission denied.");
    });
  }
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    document.getElementById("recordBtn").innerText = "🎙️";
  }
}
window.onload = async () => {
  cleanupOldRooms();
  setupSidebarBackHandler();
  setupVisibilityAttention();
  resetWebsiteData();
  const notif = localStorage.getItem("notifications_enabled");
  notificationsEnabled = notif === "true";
  isRegisterMode = false;
  toggleAuthMode();
  showScreen("authScreen");
};

function sanitizeUsername(name) {
  return name.replace(/[.#$\[\]]/g, "_");
}
function submitProfile() {
  const name = document.getElementById("profileUsernameInput").value.trim();
  const desc = document.getElementById("profileDescriptionInput").value.trim();
  const error = document.getElementById("profileError");

  if (!name || !desc) {
    error.innerText = "Please enter both a username and a description.";
    error.style.display = "block";
    return;
  }

  const sanitized = sanitizeUsername(name);
  const profileRef = db.ref(`profiles/${sanitized}`);

  // Check if username exists
  profileRef.once("value").then(snapshot => {
    if (snapshot.exists()) {
      error.innerText = "❌ Username already taken.";
      error.style.display = "block";
    } else {
      // Set profile data
      const profileData = {
        username: name,
        description: desc,
        lastChanged: Date.now(),
        usernameHistory: [name]
      };

      profileRef.set(profileData, (err) => {
        if (err) {
          console.error("Failed to save profile:", err);
          error.innerText = "⚠️ Failed to save profile. Try again.";
          error.style.display = "block";
        } else {
          localStorage.setItem("chat_username", name);
          localStorage.setItem("profile_description", desc);
          username = name;
          document.getElementById("namePreview").innerText = name;
          showScreen("roomChoiceScreen");
        }
      });
    }
  }).catch(err => {
    console.error("Error checking username:", err);
    error.innerText = "⚠️ Could not check username. Try again.";
    error.style.display = "block";
  });
}
function saveProfile(name, desc, key) {
  const timestamp = Date.now();
  const history = [name];
  db.ref(`profiles/${key}`).set({
    username: name,
    description: desc,
    lastChanged: timestamp,
    usernameHistory: history
  });

  document.getElementById("namePreview").innerText = name;
  showScreen("roomChoiceScreen");
}

function generateRoom() {
  roomCode = genRoomCode();
  db.ref("rooms/" + roomCode).set({ active: true, created: Date.now() });
  startChat();
}
function joinRoom() {
  const inputCode = (roomCode || document.getElementById("roomCodeInput").value.trim().toUpperCase());
  if (!inputCode) return alert("Enter a valid room code");
  roomCode = inputCode;

  // Static room flow → show password screen first
  if (roomCode === STATIC_ROOM) {
    showScreen("passwordScreen");
    return;
  }

  // Regular room
  db.ref("rooms/" + roomCode).get().then(snap => {
    if (snap.exists() && snap.val().active !== false) {
      startChat();
    } else {
      alert("Room doesn't exist or is inactive.");
    }
  });
}
async function startChat() {
  if (!roomCode || !username) {
    alert("Missing room or user information.");
    return showScreen("roomChoiceScreen");
  }

  listenForPauseState();
  listenForUserList();  
  await loadRoomRoles(); // Fetch global + per-room roles first
  listenForAnnouncement();

  const sanitized = sanitizeUsername(username);
  const userRef = db.ref(`users/${roomCode}/${sanitized}`);

  const userData = {
    username: username,
    online: true,
    lastOnline: firebase.database.ServerValue.TIMESTAMP
  };

  userRef.set(userData, (error) => {
    if (error) {
      alert("Failed to register user into room.");
      return showScreen("roomChoiceScreen");
    }

    // Avatar
    const sidebarAvatar = document.getElementById("sidebarAvatarPreview");
    if (avatarBase64) {
      sidebarAvatar.src = "data:image/png;base64," + avatarBase64;
      sidebarAvatar.style.display = "block";
    }

    document.getElementById("userDisplay").innerHTML = `${username} ${getRoleTag(sanitized)}`;
    document.getElementById("roomDisplay").innerText = (roomCode === STATIC_ROOM) ? "No room code available for private rooms" : roomCode;

    updateAnnouncementVisibility(); // 🆕 based on role

    const key = db.ref().push().key;
    db.ref(`rooms/${roomCode}/messages/${key}`).set({
      msg: `${username} is online`,
      sender: "system",
      senderId: "system",
      timestamp: Date.now()
    });

    showScreen("chatScreen");

    document.getElementById("announcementArea").addEventListener("click", (e) => {
      if (e.detail === 3 && (role === "admin" || role === "dev")) {
        if (confirm("Remove this announcement?")) {
          db.ref(`rooms/${roomCode}/announcement`).remove().then(() => {
            document.getElementById("announcementArea").innerText = "";
          });
        }
      }
    });

    listenForMessages();
    listenForTyping();
    startInactivityTimer();
    trackPresence();
    watchProfileChanges();
    watchMuteStatus();
    startSidebarSyncLoop();
    // 👇 Live profile and role changes apply immediately to all
    const refreshRolesAndUI = () => {
      loadRoomRoles().then(() => {
        renderUserLists(roomUsers);
        updateAnnouncementVisibility();
      });
    };
    db.ref("auth").on("child_changed", refreshRolesAndUI);
    db.ref("auth").on("child_added", refreshRolesAndUI);
  });
}
function updateAnnouncementVisibility() {
  const btn = document.getElementById("addAnnouncementBtn");
  if (role === "admin" || role === "dev") {
    btn.style.display = "block";
  } else {
    btn.style.display = "none";
  }
}
function watchProfileChanges() {
  const userKey = sanitizeUsername(username);
  db.ref(`auth/${userKey}`).on("value", snap => {
    if (!snap.exists()) return;

    const data = snap.val();
    userDescription = data.description || "";
    avatarBase64 = data.avatarBase64 || "";
    role = data.role || "user";

    if (avatarBase64) {
      const sidebarAvatar = document.getElementById("sidebarAvatarPreview");
      if (!sidebarAvatar.src.includes(avatarBase64)) {
        sidebarAvatar.src = "data:image/png;base64," + avatarBase64;
        sidebarAvatar.style.display = "block";
      }
    }

    renderUserLists(roomUsers); // <- safely update
  });
}
let lastImageTime = 0;
function uploadImage(input) {
  const now = Date.now();
  if (now - lastImageTime < 10000) {
    alert("🕒 Please wait 10 seconds before sending another image.");
    return;
  }
  lastImageTime = now;
  const file = input.files[0];
  if (!file || file.size > 2 * 1024 * 1024) {
    alert("❌ Image must be under 2MB");
    return;
  }

  const reader = new FileReader();
  reader.onloadend = () => {
    const base64 = reader.result.split(',')[1];
    const key = db.ref().push().key;

    db.ref(`rooms/${roomCode}/messages/${key}`).set({
      imageBase64: base64,
      sender: username,
      senderId: clientId,
      timestamp: Date.now()
    });
  };
  reader.readAsDataURL(file);
}
async function fetchProfile(usernameKey) {
  const snap = await db.ref(`auth/${usernameKey}`).get();
  if (!snap.exists()) return null;
  return snap.val();
}
function validateStaticRoomPassword() {
  const enteredPassword = document.getElementById("staticPasswordInput").value.trim();
  
  if (!enteredPassword) {
    alert("Please enter the password.");
    return;
  }

  db.ref(`gr8stg/${STATIC_ROOM}`).get().then(snapshot => {
    if (!snapshot.exists()) {
      alert("Room password not set. Cannot join.");
      return;
    }

    const correctPassword = snapshot.val();
    if (enteredPassword === correctPassword) {
      // Password correct, proceed
      roomCode = STATIC_ROOM;
      startChat();
    } else {
      document.getElementById("passwordError").innerText = "Incorrect password";
      document.getElementById("passwordError").style.display = "block";
    }
  }).catch(err => {
    console.error(err);
    alert("Error connecting to server. Try again later.");
  });
}
function listenForPauseState() {
  db.ref(`roomStates/${roomCode}/paused`).on("value", snap => {
    const paused = snap.exists() && snap.val() === true;
    document.getElementById("pausedOverlay").style.display = paused ? "block" : "none";
  });
}

const spamTimestamps = [];

async function sendMessage() {
  const roomStateSnap = await db.ref(`roomStates/${roomCode}/paused`).get();
  const mutedSnap = await db.ref(`muted/${roomCode}/${sanitizeUsername(username)}`).get();
  if (mutedSnap.exists()) {
    const val = mutedSnap.val();
    const mutedUntil = typeof val === 'object' && val.muteUntil ? val.muteUntil : val;
  
    if (mutedUntil > Date.now()) {
      alert("⛔ You are muted.");
      return;
    }
  }  
  if (roomStateSnap.exists() && roomStateSnap.val() === true && role !== "dev") {
    alert("Room is currently paused.");
    return;
  }  
  const input = document.getElementById("msgInput");
  const msg = input.value.trim();
  if (!msg || isBlocked) return;

  const now = Date.now();
  const lowerMsg = msg.toLowerCase();
  const containsSwear = swearWords.some(word => lowerMsg.includes(word));
  
  if (containsSwear) {
    alert("⚠️ Please keep the chat respectful.");
    return;
  }  
  // SPAM DETECTION: 5 messages in 7 seconds
  spamTimestamps.push(now);
  const recent = spamTimestamps.filter(t => now - t < 7000);
  if (recent.length > 5) {
    isBlocked = true;
    input.disabled = true;
    input.placeholder = "⛔ You're blocked for spamming (30s)";
    alert("⛔ You’ve been muted for spamming. Please wait 30 seconds.");

    setTimeout(() => {
      isBlocked = false;
      input.disabled = false;
      input.placeholder = "Type a message...";
      spamTimestamps.length = 0;
    }, 30000);
    return;
  }
  const repeatedCharMatch = msg.match(/(.)\1{14,}/);
  if (repeatedCharMatch) {
    alert("⚠️ No spamming allowed.");
    return;
  }  
  // Send message
  const avatar = localStorage.getItem("avatar_base64") || "";
  const key = db.ref().push().key;

  db.ref(`rooms/${roomCode}/messages/${key}`).set({
    msg,
    sender: username,
    senderId: clientId,
    avatarBase64: avatar,
    timestamp: now
  });

  input.value = '';
  sendTyping(true);
  lastActivity = now;
}

function listenForMessages() {
  const roomRef = db.ref(`rooms/${roomCode}/messages`);
  const query = roomRef.limitToLast(MAX_MESSAGES);
  userListReady = true;
  query.on("child_added", (snap) => {
    const data = snap.val();
    const { senderId } = data;
    const sent = senderId === clientId;

    if (!userListReady) {
      // Queue it for later
      pendingMessages.forEach(({ data, sent, key }) => {
        addMessage(data, sent, key);
      });
      pendingMessages = [];
      return;
    }
    const audioUrl = data.audioUrl || null;
    const audioBase64 = data.audioBase64 || null;

    addMessage(data, sent, snap.key);

    if (roomCode !== STATIC_ROOM && data.sender !== "system") {
    }    
    // Notify
    if (!sent) {
      sound.play();
      flagPageAttention();
    }
    if (notificationsEnabled && !sent && Notification.permission === "granted") {
      const msgText = data.msg || (data.audioBase64 ? "[Voice Message]" : data.imageBase64 ? "[Image]" : "[Unknown]");
      new Notification(`💬 ${data.sender}`, {
        body: msgText,
        icon: "https://upload.wikimedia.org/wikipedia/commons/8/8c/Speech_bubble_icon.svg"
      });
    }         
  });
  roomRef.once("value").then(snapshot => {
    const allMessages = snapshot.val();
    const keys = Object.keys(allMessages || {});
    if (keys.length > MAX_MESSAGES) {
      const excess = keys.length - MAX_MESSAGES;
      const oldestKeys = keys.sort((a, b) => allMessages[a].timestamp - allMessages[b].timestamp).slice(0, excess);
  
      oldestKeys.forEach(k => {
        db.ref(`rooms/${roomCode}/messages/${k}`).remove();
      });
    }
  });  
  db.ref(`rooms/${roomCode}/messages`).on("child_removed", (snap) => {
    const msgKey = snap.key;
    const msgDiv = document.querySelector(`[data-msg-id="${msgKey}"]`);
    if (msgDiv) msgDiv.remove();
  });  
}
function stackNotification(sender, content) {
  notificationStack.push({ sender, content });

  clearTimeout(notificationTimer);

  notificationTimer = setTimeout(() => {
    showStackedNotification();
    notificationStack = [];
  }, 1000); // Group all messages received within 1 second
}

function showStackedNotification() {
  if (!notificationStack.length || Notification.permission !== "granted") return;

  const uniqueSenders = [...new Set(notificationStack.map(n => n.sender))];
  const room = roomCode || "unknown";

  const body = uniqueSenders.length === 1
    ? `You got a message from ${uniqueSenders[0]} in room ${room}: ${notificationStack[0].content}`
    : `You got messages from ${uniqueSenders.join(", ")} in room ${room}`;

  setTimeout(() => {
    new Notification("New Chat Message", {
      body: body,
      icon: "https://upload.wikimedia.org/wikipedia/commons/8/8c/Speech_bubble_icon.svg" // generic chat icon
    });
  }, 100); // Tiny delay to allow UI to finish
}
async function addMessage(data, sent, firebaseKey = null) {
  const { msg, sender, senderId, timestamp, audioUrl, audioBase64, imageBase64 } = data;
  const safeSender = sanitizeUsername(sender);
  const div = document.createElement("div");

  // System message
  if (data.sender === "system") {
    const sysDiv = document.createElement("div");
    sysDiv.className = "system-msg";
    sysDiv.dataset.msgId = firebaseKey || data.timestamp;
    sysDiv.dataset.timestamp = data.timestamp;
  
    sysDiv.style.textAlign = "center";
    sysDiv.style.fontSize = "0.8rem";
    sysDiv.style.color = "#aaa";
    sysDiv.style.margin = "6px auto";
    sysDiv.innerText = data.msg;
  
    const msgBox = document.getElementById("messages");
    msgBox.appendChild(sysDiv);
  
    // Sort all messages by timestamp (ensure system messages are not jumping around)
    const allMsgs = Array.from(msgBox.children);
    allMsgs.sort((a, b) => {
      return (+a.dataset.timestamp || 0) - (+b.dataset.timestamp || 0);
    });
    msgBox.innerHTML = "";
    allMsgs.forEach(m => msgBox.appendChild(m));
    msgBox.scrollTop = msgBox.scrollHeight;
  
    return;
  }  

  div.classList.add("msg", sent ? "sent" : "received");
  div.style.position = "relative";
  if (firebaseKey) {
    div.dataset.msgId = firebaseKey;
  }  
  const time = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const roleTag = getRoleTag(safeSender);
  const avatar = await fetchAvatar(safeSender);
  const avatarImg = avatar
    ? `<img src="data:image/png;base64,${avatar}" style="width:24px;height:24px;border-radius:50%;margin-right:6px;vertical-align:middle;">`
    : "";

  const senderHtml = `${avatarImg}<span class="sender-name">${sender} ${roleTag}</span>`;
  const highlightedText = msg?.replace(new RegExp(`@${username}\\b`, 'gi'), `<span style="color:#ff4081;">@$&</span>`);

  let content = `${senderHtml}<br>`;
  if (audioUrl) {
    content += `<audio controls src="${audioUrl}" style="width:100%; max-width:100%; margin-top:5px;"></audio>`;
  } else if (audioBase64) {
    const audioSrc = `data:audio/webm;base64,${audioBase64}`;
    content += `<audio controls src="${audioSrc}" style="width:100%; max-width:100%; margin-top:5px;"></audio>`;
  } else if (imageBase64) {
    const imageSrc = `data:image/png;base64,${imageBase64}`;
    content += `<img src="${imageSrc}" style="max-width:80%;height:auto;margin-top:5px;border-radius:10px;" />`;
  } else {
    const linkedText = highlightedText.replace(/(https?:\/\/[^\s]+)/g, url => {
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#0ff;">${url}</a>`;
    });
    content += `<div>${linkedText}</div>`;
  }

  content += `<small>${time}</small>`;
  div.innerHTML = content;

  // Reaction box (displayed below message)
  const reactionBox = document.createElement("div");
  reactionBox.className = "reaction-box";
  reactionBox.style.marginTop = "4px";
  reactionBox.style.fontSize = "16px";
  div.appendChild(reactionBox);

  // Reaction tray (emoji popup on hover/long press)
  const reactionTray = document.createElement("div");
  reactionTray.className = "reaction-tray";
  const emojis = ["❤️", "😂", "😮", "😢", "👎", "💀", "🤯"]; // add more later
  reactionTray.innerHTML = emojis.map(e => `<button>${e}</button>`).join('');
  reactionTray.style.display = "none";
  reactionTray.style.position = "absolute";
  reactionTray.style.background = "#222";
  reactionTray.style.padding = "6px";
  reactionTray.style.borderRadius = "10px";
  reactionTray.style.fontSize = "18px";
  reactionTray.style.top = "-45px";
  reactionTray.style.left = "0px";
  reactionTray.style.zIndex = "10";
  reactionTray.style.maxWidth = "160px";
  reactionTray.style.minWidth = "120px";
  reactionTray.style.whiteSpace = "normal";
  reactionTray.style.display = "grid";
  reactionTray.style.gridTemplateColumns = "repeat(auto-fill, minmax(32px, 1fr))";
  reactionTray.style.gap = "4px";
  reactionTray.style.boxShadow = "0 2px 6px rgba(0,0,0,0.5)";

  Array.from(reactionTray.children).forEach(emojiSpan => {
    emojiSpan.style.cursor = "pointer";
    emojiSpan.onclick = (e) => {
      e.stopPropagation();
      const emoji = emojiSpan.textContent;
      reactToMessage(firebaseKey, emoji);
    };
  });
  Array.from(reactionTray.children).forEach(emojiBtn => {
    emojiBtn.style.width = "32px";
    emojiBtn.style.height = "32px";
    emojiBtn.style.display = "flex";
    emojiBtn.style.alignItems = "center";
    emojiBtn.style.justifyContent = "center";
    emojiBtn.style.fontSize = "20px";
  });  
  div.appendChild(reactionTray);
  reactionTray.style.display = "none";
  let hoverTimer;
  div.addEventListener("mouseenter", () => {
    hoverTimer = setTimeout(() => {
      reactionTray.style.display = "inline-block";
    }, 1500);
  });
  div.addEventListener("mouseleave", () => {
    clearTimeout(hoverTimer);
    reactionTray.style.display = "none";
  });  
  let pressTimer;
  div.addEventListener("touchstart", () => {
    pressTimer = setTimeout(() => {
      reactionTray.style.display = "inline-block";
    }, 1500);
  });
  div.addEventListener("touchend", () => clearTimeout(pressTimer));  

  // Live reaction display listener
  if (firebaseKey) {
    db.ref(`rooms/${roomCode}/messages/${firebaseKey}/reactions`).on("value", snap => {
      if (!snap.exists()) {
        reactionBox.innerHTML = "";
        return;
      }

      const reactions = snap.val();
      let html = "";

      Object.entries(reactions).forEach(([emoji, users]) => {
        if (Array.isArray(users) && users.length > 0) {
          html += `<span style="margin-right:6px;">${emoji} ${users.length}</span>`;
        }
      });

      reactionBox.innerHTML = html;
    });
  }

  // Triple-click delete (mods, admins, devs)
  if (["dev", "admin", "moderator"].includes(role)) {
    let clickCount = 0;
    div.addEventListener("click", () => {
      clickCount++;
      if (clickCount === 3) {
        if (confirm("Delete this message?")) {
          db.ref(`rooms/${roomCode}/messages/${firebaseKey}`).remove();
          div.remove();
        }
      }
      setTimeout(() => clickCount = 0, 1500);
    });
  }

  const msgBox = document.getElementById("messages");
  msgBox.appendChild(div);
  msgBox.scrollTop = msgBox.scrollHeight;
}
function cleanupOldRooms() {
  db.ref("rooms").once("value").then(snapshot => {
    const rooms = snapshot.val();
    if (!rooms) return;
    const now = Date.now();
    for (const code in rooms) {
      if (code === STATIC_ROOM) continue;
      const room = rooms[code];
      if (now - (room.created || 0) > 2 * 60 * 1000) {
        db.ref("rooms/" + code).remove();
      }
    }
    // Clean old anti-spam tracking
    db.ref("antispam").once("value").then(snapshot => {
      const data = snapshot.val();
      if (!data) return;
      for (const room in data) {
        if (room !== STATIC_ROOM) db.ref(`antispam/${room}`).remove();
      }
    });

    db.ref("antispamBlocked").once("value").then(snapshot => {
      const data = snapshot.val();
      if (!data) return;
      for (const room in data) {
        if (room !== STATIC_ROOM) db.ref(`antispamBlocked/${room}`).remove();
      }
    });
  });
}
document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("msgInput");
  if (input) {
    input.addEventListener("keypress", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});
function showScreen(id) {
  ["usernameScreen", "roomChoiceScreen", "codeEntryScreen", "chatScreen", "passwordScreen", "profileScreen", "profileViewer", "authScreen", "editProfileScreen"].forEach(s => {
    document.getElementById(s).style.display = "none";
  });
  document.getElementById(id).style.display = "flex";
}

function genRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const get = (set, len) => Array.from({ length: len }, () => set[Math.floor(Math.random() * set.length)]).join('');
  return get(digits, 3) + get(chars, 3) + get(digits, 2) + get(chars, 2);
}

function startInactivityTimer() {
  setInterval(() => {
    if (Date.now() - lastActivity > 5 * 60 * 1000 && roomCode !== STATIC_ROOM) {
      db.ref("rooms/" + roomCode).update({ active: false });
      alert("Session expired.");
      location.reload();
    }
  }, 30000);
}

function setupSidebarBackHandler() {
  window.addEventListener("popstate", () => {
    const sidebar = document.getElementById("userSidebar");
    if (sidebar?.classList.contains("show")) {
      sidebar.classList.remove("show");
    }
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById("userSidebar");
  if (!sidebar.classList.contains("show")) {
    sidebar.classList.add("show");
    history.pushState({ sidebarOpen: true }, "");
  } else {
    sidebar.classList.remove("show");
    if (history.state?.sidebarOpen) history.back();
  }
}

function setupVisibilityAttention() {
  let unread = 0;
  let originalTitle = document.title;

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      document.title = originalTitle;
      unread = 0;
    }
  });

  window.flagPageAttention = function () {
    if (document.hidden) {
      unread++;
      document.title = `(${unread}) New message • ${originalTitle}`;
    }
  };
}
function tryEditProfile() {
  showScreen("editProfileScreen");
}
async function submitEditProfile() {
  const oldPass = document.getElementById("oldPasswordInput").value;
  const newPass = document.getElementById("newPasswordInput").value;
  const newBio = document.getElementById("editBioInput").value.trim();
  const error = document.getElementById("editProfileError");

  if (!oldPass) {
    error.innerText = "Please enter your current password.";
    error.style.display = "block";
    return;
  }

  const userKey = sanitizeUsername(username);
  const snap = await db.ref(`auth/${userKey}`).get();
  if (!snap.exists()) {
    error.innerText = "Profile not found.";
    error.style.display = "block";
    return;
  }

  const data = snap.val();
  const oldHash = await sha256(oldPass);

  if (oldHash !== data.passwordHash) {
    error.innerText = "Incorrect current password.";
    error.style.display = "block";
    return;
  }

  // Prepare new updates
  const updates = {};

  if (newPass) {
    const newHash = await sha256(newPass);
    updates.passwordHash = newHash;
  }

  if (newBio !== data.description) {
    updates.description = newBio;
  }

  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const canChangeUsername = (now - (data.lastChanged || 0)) > oneDay;

  if (canChangeUsername && confirm("Do you want to change your username? (only once per 24h)")) {
    const newUsername = prompt("Enter your new username:");
    if (newUsername && newUsername.trim()) {
      updates.username = newUsername.trim();
      updates.usernameHistory = (data.usernameHistory || []).concat(newUsername.trim());
      updates.lastChanged = now;
    }
  }

  // Apply Updates
  if (updates.username && updates.username !== data.username) {
    // Username changed: Move record
    await db.ref(`auth/${sanitizeUsername(updates.username)}`).set({
      ...data,
      ...updates
    });
    await db.ref(`auth/${userKey}`).remove();
    username = updates.username;
  } else {
    // Just patch
    await db.ref(`auth/${userKey}`).update(updates);
  }

  alert("✅ Profile updated! Please reload.");
  location.reload();
}
function cancelEditProfile() {
  document.getElementById("editProfileScreen").style.display = "none";
  showScreen("chatScreen");
}
let previousUsers = []; // ⬅️ Global tracker outside the function

// Global persistent user cache
let previousUserKeys = new Set();

const cachedOnlineStatus = {}; // Global per-user key map

const userStatusMap = {}; // { userKey: true|false }

function listenForUserList() {
  db.ref(`users/${roomCode}`).on("value", async (snap) => {
    if (!snap.exists()) {
      return;
    }
    const users = snap.val();
    
    // ✅ keep offline users from previous cache
    for (const key in previousUsers) {
      if (!users[key]) users[key] = previousUsers[key];
    }
    
    renderUserLists(users);
    previousUsers = users;    

    await loadRoomRoles();
    renderUserLists(users);
  });
}
function trackPresence() {
  if (!username || !roomCode) return;

  const userKey = sanitizeUsername(username);
  const userRef = db.ref(`users/${roomCode}/${userKey}`);

  const data = {
    username,
    avatarBase64: avatarBase64 || "",
    description: userDescription || "",
    online: true,
    lastOnline: firebase.database.ServerValue.TIMESTAMP
  };

  // Avoid duplicate messages — only set once
  userRef.once("value").then(snapshot => {
    const wasOnline = snapshot.val()?.online;

    userRef.set(data).then(() => {
      updateOnlineIndicator();

      // ✅ Only send online message if they weren't already online
      if (!wasOnline) {
        const key = db.ref().push().key;
        db.ref(`rooms/${roomCode}/messages/${key}`).set({
          msg: `${username} is online`,
          sender: "system",
          senderId: "system",
          timestamp: Date.now()
        });
      }

      // ✅ Offline flag on disconnect
      userRef.onDisconnect().update({
        online: false,
        lastOnline: Date.now()
      });

      // ✅ Offline message in user list render
    });
  });
}
function uploadSidebarAvatar(input) {
  if (!input.files.length) return;

  const file = input.files[0];
  const reader = new FileReader();

  reader.onloadend = async () => {
    const base64 = reader.result.split(',')[1];
    document.getElementById("sidebarAvatarPreview").src = reader.result;
    document.getElementById("sidebarAvatarPreview").style.display = "block";

    try {
      const userKey = sanitizeUsername(username);
      await db.ref(`auth/${userKey}/avatarBase64`).set(base64);
      alert("✅ Profile picture updated!");
    } catch (err) {
      console.error(err);
      alert("⚠️ Failed to update avatar.");
    }
  };

  reader.readAsDataURL(file);
}
function muteUser(user, minutes) {
  const muteUntil = Date.now() + minutes * 60 * 1000;
  db.ref(`muted/${roomCode}/${sanitizeUsername(user)}`).set({
    muteUntil
  }).then(() => {
    alert(`${user} muted for ${minutes} minutes.`);
    addSystemMessage(`${user} was muted for ${minutes} minutes`);
  });
}
function unmuteUser(target) {
  if (!isRoomAdmin) return alert("Admins only.");
  db.ref(`muted/${roomCode}/${sanitizeUsername(target)}`).remove();
}
function updateOnlineIndicator() {
  const statusEl = document.getElementById("onlineStatus");
  statusEl.innerText = "● Online";
  statusEl.style.color = "#00ff88";
}
setInterval(updateOnlineIndicator, 3000);
function viewProfile(userKey) {
  db.ref(`auth/${userKey}`).get().then(snap => {
    if (!snap.exists()) return alert("Profile not found.");

    const p = snap.val();
    const content = `
Name: ${p.username}
Description: ${p.description || "No bio set"}
Username History: ${(p.usernameHistory || []).join(", ") || "No changes yet"}
Last Changed: ${p.lastChanged ? new Date(p.lastChanged).toLocaleString() : "Unknown"}
    `.trim();

    document.getElementById("profileContent").innerText = content;
    document.getElementById("profileViewer").style.display = "block";
  });
}
function initUsernameFlow() {
  const stored = localStorage.getItem("chat_username");

  if (!stored) {
    showScreen("profileScreen");
  } else {
    username = stored;
    document.getElementById("namePreview").innerText = username;
    showScreen("roomChoiceScreen");
  }
}
function closeProfile() {
  document.getElementById("profileViewer").style.display = "none";
}
function resetWebsiteData() {
  try {
    const notifBackup = localStorage.getItem("notifications_enabled");

    localStorage.clear();
    sessionStorage.clear();
    
    if (notifBackup) {
      localStorage.setItem("notifications_enabled", notifBackup);
    }    
  } catch(e) {}

  if (!username || !roomCode) {
    username = null;
    roomCode = null;
    isRoomAdmin = false;
    pendingMessages = [];
    clientId = "_" + Math.random().toString(36).substr(2, 9);
  }
}
function addAnnouncement() {
  const text = prompt("Enter Announcement Text:");
  if (!text) return;

  db.ref(`rooms/${roomCode}/announcement`).set({
    text,
    by: username,
    timestamp: Date.now()
  });
}

// Listen for announcement
function listenForAnnouncement() {
  const annRef = db.ref(`rooms/${roomCode}/announcement`);
  annRef.on("value", snap => {
    const data = snap.val();
    if (!data) {
      document.getElementById("announcementArea").innerText = "";
      return;
    }
    const area = document.getElementById("announcementArea");
    area.innerText = `${data.text}`;
  });
}

// Allow triple click removal for admins
document.getElementById("announcementArea").addEventListener("click", (e) => {
  if (e.detail === 3 && isRoomAdmin) {
    if (confirm("Remove Announcement?")) {
      db.ref(`rooms/${roomCode}/announcement`).remove();
    }
  }
});
document.getElementById("msgInput").addEventListener("input", () => {
  const input = document.getElementById("msgInput");
  if (blocked) {
    input.style.border = "2px solid red";
  } else {
    input.style.border = "";
  }  

  const val = input.value.toLowerCase();
  const blocked = swearWords.some(word => val.includes(word));

  if (blocked) {
    input.style.border = "2px solid red";
    sendBtn.disabled = true;
  } else {
    input.style.border = "";
    if (blocked) {
      input.style.border = "2px solid red";
    } else {
      input.style.border = "";
    }
    
  }
});
function muteUser(user, minutes) {
  const muteUntil = Date.now() + minutes * 60 * 1000;
  db.ref(`muted/${roomCode}/${sanitizeUsername(user)}`).set({
    muteUntil
  }).then(() => {
    alert(`${user} muted for ${minutes} minutes.`);
  });
}
function deleteUserMessages(user) {
  db.ref(`rooms/${roomCode}/messages`).orderByChild("sender").equalTo(user).get().then(snapshot => {
    snapshot.forEach(child => {
      db.ref(`rooms/${roomCode}/messages/${child.key}`).remove();
    });
    alert(`Messages by ${user} deleted.`);
  });
}
function pauseRoom(paused) {
  db.ref(`rooms/${roomCode}/paused`).on("value", snap => {
    const paused = snap.val();
    document.getElementById("pausedOverlay").style.display = paused ? "block" : "none";
  });  
}
function canPerformAction(action) {
  if (role === "dev") return true; // Dev can do anything

  if (action === "mute") {
    return role === "admin" || role === "moderator" || role === "mod";
  }
  if (action === "deleteMessage" || action === "promote") {
    return role === "admin"; // mods cannot promote or delete
  }  
  if (action === "promote") {
    return role === "admin"; // Only admins promote to Moderator (not to Dev)
  }

  return false;
}
const html = Object.values(roomUsers).map(user => {
  const safeName = sanitizeUsername(user.username);
  const controls = [];

  // Self-protection: don't allow muting/promoting self
  if (safeName !== sanitizeUsername(username)) {
    
    if (canPerformAction("mute")) {
      controls.push(`<button onclick="muteUser('${safeName}', 5)">Mute 5m</button>`);
      controls.push(`<button onclick="muteUser('${safeName}', 10)">Mute 10m</button>`);
    }

    if (canPerformAction("deleteMessage")) {
      controls.push(`<button onclick="deleteUserMessages('${safeName}')">Delete Messages</button>`);
    }

    if (role === "dev") {
      controls.push(`<button onclick="promoteToModerator('${safeName}')">Promote to Moderator</button>`);
      controls.push(`<button onclick="promoteToAdmin('${safeName}')">Promote to Admin</button>`);
    } else if (role === "admin") {
      controls.push(`<button onclick="promoteToModerator('${safeName}')">Promote to Moderator</button>`);
    }
  }

  return `
    <li style="color:#0ff;">
      ${user.username} ${getRoleTag(sanitizeUsername(user.username))}
      <div id="userOptions-${safeName}" class="user-options" style="display:none;">
        ${controls.join("")}
      </div>
      <button onclick="toggleUserOptions('${safeName}')" style="background:none;border:none;color:#0ff;font-size:0.8rem;">⚙️</button>
    </li>`;
}).join("");
function promoteToModerator(user) {
  const userKey = sanitizeUsername(user);

  if (isProtected(userKey)) {
    return alert("🚫 Cannot promote Developers.");
  }
  if (role !== "dev" && role !== "admin") {
    alert("Only Devs or Admins can promote.");
    return;
  }

  db.ref(`moderators/${roomCode}/${userKey}`).set(true).then(() => {
    alert(`${user} promoted to Moderator!`);
    addSystemMessage(`${user} was promoted to Moderator`);
  });
}

function promoteToAdmin(user) {
  const userKey = sanitizeUsername(user);

  if (isProtected(userKey)) {
    return alert("🚫 Cannot promote Developers.");
  }
  if (role !== "dev") {
    alert("Only Devs can promote to Admin.");
    return;
  }

  db.ref(`admins/${roomCode}/${userKey}`).set(true).then(() => {
    alert(`${user} promoted to Admin!`);
    addSystemMessage(`${user} was promoted to Admin`);
  });
}
function toggleUserOptions(userKey) {
  if (role === "dev" || role === "admin") {
    controls.push(`<button onclick="demoteUser('${safeName}')">Demote</button>`);
  }  
  const div = document.getElementById(`userOptions-${userKey}`);
  if (div.style.display === "none") {
    div.style.display = "block";
  } else {
    div.style.display = "none";
  }
}
function demoteUser(userKey) {
  if (isProtected(userKey)) return alert("🚫 You cannot demote a Developer.");

  if (role === "dev") {
    db.ref(`admins/${roomCode}/${userKey}`).remove();
    db.ref(`moderators/${roomCode}/${userKey}`).remove();
    alert(`${userKey} demoted to user.`);
    addSystemMessage(`${userKey} was demoted`);
  } else if (role === "admin") {
    db.ref(`moderators/${roomCode}/${userKey}`).remove();
    alert(`${userKey} demoted to user.`);
    addSystemMessage(`${userKey} was demoted`);
  } else {
    alert("🚫 Only Admins or Devs can demote.");
  }
}

function getRoleTag(userKey) {
  const safe = sanitizeUsername(userKey);
  if (globalDevs.includes(safe)) return `<span style="color:darkblue;">[Dev]</span>`;
  if (roomAdmins.includes(safe)) return `<span style="color:darkred;">[Admin]</span>`;
  if (roomModerators.includes(safe)) return `<span style="color:darkgreen;">[Mod]</span>`;
  return "";
}
async function loadRoomRoles() {
  const currentUserKey = sanitizeUsername(username);

  globalDevs = [];
  roomAdmins = [];
  roomModerators = [];

  // Load devs
  const authSnap = await db.ref("auth").get();
  authSnap.forEach((child) => {
    if (child.val().role === "dev") globalDevs.push(child.key);
  });

  // Load admins
  const adminSnap = await db.ref(`admins/${roomCode}`).get();
  if (adminSnap.exists()) {
    adminSnap.forEach((child) => roomAdmins.push(child.key));
  }

  // Load moderators
  const modSnap = await db.ref(`moderators/${roomCode}`).get();
  if (modSnap.exists()) {
    modSnap.forEach((child) => roomModerators.push(child.key));
  }

  // Set your current role
  if (globalDevs.includes(currentUserKey)) {
    role = "dev";
  } else if (roomAdmins.includes(currentUserKey)) {
    role = "admin";
  } else if (roomModerators.includes(currentUserKey)) {
    role = "moderator";
  } else {
    role = "user";
  }
}
async function renderUserLists(activeUsers) {
  roomUsers = activeUsers;
  const userKey = sanitizeUsername(username);
  const showAdminList = ["dev", "admin", "moderator", "mod"].includes(role);

  document.getElementById("adminControlsSection").style.display = showAdminList ? "block" : "none";

  // === Regular sidebar (everyone's list) ===
  const userHtmlPromises = Object.entries(activeUsers).map(async ([key, user]) => {
    const safeName = sanitizeUsername(user.username || key);
    const avatar = await fetchAvatar(safeName);
    const avatarImg = avatar
      ? `<img src="data:image/png;base64,${avatar}" style="width:20px;height:20px;border-radius:50%;margin-right:6px;vertical-align:middle;">`
      : "";

    const statusDot = user.online
      ? `<span style="color:#0f0;font-size:1rem;">●</span>`
      : `<span style="color:red;font-size:1rem;">●</span>`;

    return `<li>${avatarImg} ${statusDot} <span style="cursor:pointer;color:#00ffc3;" onclick="viewProfile('${safeName}')">${user.username || key}</span> ${getRoleTag(safeName)}</li>`;
  });

  document.getElementById("userList").innerHTML = (await Promise.all(userHtmlPromises)).join("");

  if (!showAdminList) return;

  // === Admin section ===
  const adminHtmlPromises = Object.entries(activeUsers).map(async ([key, user]) => {
    const safeName = sanitizeUsername(user.username || key);
    if (safeName === userKey) return "";

    const isDev = globalDevs.includes(safeName);
    const avatar = await fetchAvatar(safeName);
    const avatarImg = avatar
      ? `<img src="data:image/png;base64,${avatar}" style="width:20px;height:20px;border-radius:50%;margin-right:6px;vertical-align:middle;">`
      : "";

    const statusDot = user.online
      ? `<span style="color:#0f0;font-size:1rem;">●</span>`
      : `<span style="color:red;font-size:1rem;">●</span>`;

    const controls = [];

    // Mods can ONLY mute
    if (!isDev) {
      if (["mod", "moderator", "admin", "dev"].includes(role)) {
        controls.push(`<button onclick="muteUser('${safeName}', 1)">Mute 1m</button>`);
        controls.push(`<button onclick="muteUser('${safeName}', 5)">Mute 5m</button>`);
        controls.push(`<button onclick="muteUser('${safeName}', 10)">Mute 10m</button>`);
      }

      if (role === "dev") {
        controls.push(`<button onclick="promoteToModerator('${safeName}')">+Mod</button>`);
        controls.push(`<button onclick="promoteToAdmin('${safeName}')">+Admin</button>`);
        controls.push(`<button onclick="demoteUser('${safeName}')">Demote</button>`);
      } else if (role === "admin") {
        controls.push(`<button onclick="promoteToModerator('${safeName}')">+Mod</button>`);
        controls.push(`<button onclick="demoteUser('${safeName}')">Demote</button>`);
      }
    }

    return `
      <li style="margin-bottom:10px;">
        ${avatarImg} ${statusDot} 🔧 ${user.username || key} ${getRoleTag(safeName)}<br/>
        <div style="margin-top:5px;">${controls.join(" ")}</div>
      </li>`;
  });

  document.getElementById("adminUserList").innerHTML = (await Promise.all(adminHtmlPromises)).join("");
}
function updateAnnouncementVisibility() {
  const btn = document.getElementById("addAnnouncementBtn");
  if (role === "admin" || role === "dev") {
    btn.style.display = "block";
  } else {
    btn.style.display = "none";
  }
}
async function fetchAvatar(usernameKey) {
  if (userAvatars[usernameKey]) return userAvatars[usernameKey]; // cached

  const snap = await db.ref(`auth/${usernameKey}`).get();
  if (snap.exists() && snap.val().avatarBase64) {
    userAvatars[usernameKey] = snap.val().avatarBase64;
    return userAvatars[usernameKey];
  }

  return null;
}
function sendTyping() {
  const sanitized = sanitizeUsername(username);
  const now = Date.now();
  db.ref(`typing/${roomCode}/${sanitized}`).set(now);

  if (typingTimeout) clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    db.ref(`typing/${roomCode}/${sanitized}`).remove();
  }, 500); // Auto-remove after 3s
}
function listenForTyping() {
  db.ref(`typing/${roomCode}`).on("value", (snap) => {
    const typingDiv = document.getElementById("typing");
    if (!snap.exists()) return typingDiv.innerText = "";

    const now = Date.now();
    const usersTyping = Object.entries(snap.val())
      .filter(([key, ts]) => key !== sanitizeUsername(username) && now - ts < 5000)
      .map(([key]) => key);

    typingDiv.innerText = usersTyping.length
      ? `${usersTyping.join(", ")} is typing...`
      : "";
  });
}
function watchMuteStatus() {
  const muteRef = db.ref(`muted/${roomCode}/${sanitizeUsername(username)}`);
  let muteCheckInterval;

  muteRef.on("value", snap => {
    clearInterval(muteCheckInterval);
    const input = document.getElementById("msgInput");

    if (!snap.exists()) {
      input.disabled = false;
      input.placeholder = "Type a message...";
      return;
    }

    const data = snap.val();
    const until = typeof data === 'object' && data.muteUntil ? data.muteUntil : data;

    if (until > Date.now()) {
      input.disabled = true;
      input.placeholder = "⛔ You are muted.";

      muteCheckInterval = setInterval(() => {
        if (Date.now() > until) {
          muteRef.remove();
        }
      }, 3000); // check every 3s
    } else {
      input.disabled = false;
      input.placeholder = "Type a message...";
      muteRef.remove();
    }
  });
}
function isProtected(userKey) {
  return globalDevs.includes(userKey);
}
function addSystemMessage(text) {
  const div = document.createElement("div");
  div.style.textAlign = "center";
  div.style.fontSize = "0.8rem";
  div.style.color = "#aaa";
  div.style.margin = "6px auto";
  div.innerText = text;
  document.getElementById("messages").appendChild(div);
  document.getElementById("messages").scrollTop = document.getElementById("messages").scrollHeight;
}
function reactToMessage(msgKey, emoji) {
  const userKey = sanitizeUsername(username);
  const reactionRef = db.ref(`rooms/${roomCode}/messages/${msgKey}/reactions`);

  reactionRef.once("value").then(snap => {
    const allReactions = snap.val() || {};
    const updates = {};

    // Remove user from all emojis
    for (const [e, users] of Object.entries(allReactions)) {
      updates[e] = (users || []).filter(u => u !== userKey);
    }

    // Toggle selected emoji
    if (!allReactions[emoji] || !allReactions[emoji].includes(userKey)) {
      if (!updates[emoji]) updates[emoji] = [];
      updates[emoji].push(userKey);
    }

    reactionRef.set(updates);
  });
}
function startSidebarSyncLoop() {
  setInterval(async () => {
    if (!roomCode) return;

    const snap = await db.ref(`users/${roomCode}`).get();
    if (snap.exists()) {
      const users = snap.val();
      renderUserLists(users);
    }
  }, 5000); // every 5 seconds
}