const appDocRef = db.collection("appData").doc("zync");
const reviewsRef = appDocRef.collection("reviews");

const $ = (id) => document.getElementById(id);
const esc = (s) => {
  const d = document.createElement("div");
  d.textContent = s == null ? "" : s;
  return d.innerHTML;
};
const starStr = (n) => "★".repeat(n) + "☆".repeat(5 - n);

function toast(msg, type = "ok") {
  const t = document.createElement("div");
  t.className = "toast " + type;
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => t.classList.add("show"));
  setTimeout(() => {
    t.classList.remove("show");
    setTimeout(() => t.remove(), 400);
  }, 3000);
}

/* =================== PUBLIC PAGE (Index) =================== */
let currentShotIndex = 0;
let shotUrls = [];
let myRating = 0;

if ($("download-btn")) {
  initPublic();
}

function initPublic() {
  appDocRef.onSnapshot((doc) => {
    const d = doc.exists ? doc.data() : {};
    $("app-name").textContent = d.name || "ZYNC";
    $("app-dev").textContent = d.dev || "Made by Skedz";
    document.title = (d.name || "Zync") + " - Download";
    if (d.icon) $("logo").src = d.icon;
    
    const btn = $("download-btn");
    btn.href = d.link || "#";
    btn.classList.toggle("disabled", !d.link);
    $("app-desc").textContent = d.desc || "No description yet.";
    renderShots(d.screenshots || []);
  });

  reviewsRef.orderBy("ts", "desc").onSnapshot((snap) => {
    const list = $("reviews-list");
    list.innerHTML = "";
    let sum = 0;
    snap.forEach((doc) => {
      const r = doc.data();
      sum += r.rating || 0;
      const el = document.createElement("div");
      el.className = "review";
      el.innerHTML = `<div class="review-top"><b>${esc(r.name || "Anonymous")}</b><span class="stars-s">${starStr(r.rating || 0)}</span></div>${r.text ? `<p>${esc(r.text)}</p>` : ""}`;
      list.appendChild(el);
    });
    const n = snap.size;
    $("avg-num").textContent = n ? (sum / n).toFixed(1) : "0.0";
    $("avg-stars").textContent = starStr(n ? Math.round(sum / n) : 0);
    $("avg-count").textContent = n ? `${n} rating${n > 1 ? "s" : ""}` : "No ratings yet";
    if (!n) list.innerHTML = '<p class="empty">Be the first to rate this app.</p>';
  });

  setupStars();
  $("review-submit").onclick = submitReview;

  // ==== LIGHTBOX & SWIPE LOGIC (Mobile Optimized) ====
  $("close-btn").onclick = () => $("lightbox").classList.remove("open");
  $("lightbox").onclick = (e) => {
      if (e.target.id === "lightbox") $("lightbox").classList.remove("open");
  };

  $("prev-btn").onclick = () => {
      currentShotIndex = (currentShotIndex - 1 + shotUrls.length) % shotUrls.length;
      updateLightboxImage();
  };
  $("next-btn").onclick = () => {
      currentShotIndex = (currentShotIndex + 1) % shotUrls.length;
      updateLightboxImage();
  };

  let touchstartX = 0;
  let touchendX = 0;
  const lightboxEl = $("lightbox");

  lightboxEl.addEventListener('touchstart', e => {
      touchstartX = e.changedTouches[0].screenX;
  }, {passive: true});

  // Prevent background scroll while swiping in lightbox
  lightboxEl.addEventListener('touchmove', e => {
      if(lightboxEl.classList.contains("open")) {
          e.preventDefault(); 
      }
  }, {passive: false});

  lightboxEl.addEventListener('touchend', e => {
      touchendX = e.changedTouches[0].screenX;
      handleSwipe();
  }, {passive: true});

  function handleSwipe() {
      const swipeThreshold = 40; // Minimum distance to trigger swipe
      if (touchendX < touchstartX - swipeThreshold) $("next-btn").click(); 
      if (touchendX > touchstartX + swipeThreshold) $("prev-btn").click(); 
  }
}

function renderShots(urls) {
  const box = $("screenshot-container");
  box.innerHTML = "";
  if (!urls.length) { box.innerHTML = '<p class="empty">No screenshots yet.</p>'; return; }
  
  shotUrls = urls;
  
  urls.forEach((u, index) => {
    const img = document.createElement("img");
    img.src = u; img.loading = "lazy"; img.alt = "Screenshot";
    img.onclick = () => { 
        currentShotIndex = index;
        updateLightboxImage();
        $("lightbox").classList.add("open"); 
    };
    box.appendChild(img);
  });
}

function updateLightboxImage() {
    if(!shotUrls.length) return;
    $("lightbox-img").src = shotUrls[currentShotIndex];
}

function setupStars() {
  const box = $("star-input");
  box.innerHTML = [1, 2, 3, 4, 5].map((n) => `<button type="button" data-v="${n}" aria-label="${n} star">★</button>`).join("");
  const paint = (v) => [...box.children].forEach((b, i) => b.classList.toggle("on", i < v));
  box.onclick = (e) => {
    const b = e.target.closest("button"); if (!b) return;
    myRating = +b.dataset.v; paint(myRating);
    b.classList.add("pop"); setTimeout(() => b.classList.remove("pop"), 350);
  };
  box.onmouseover = (e) => { const b = e.target.closest("button"); if (b) paint(+b.dataset.v); };
  box.onmouseleave = () => paint(myRating);
}

async function submitReview() {
  if (!myRating) return toast("Tap a star to rate first", "err");
  const btn = $("review-submit");
  btn.disabled = true;
  try {
    await reviewsRef.add({
      rating: myRating,
      name: $("rev-name").value.trim().slice(0, 40) || "Anonymous",
      text: $("rev-text").value.trim().slice(0, 500),
      ts: firebase.firestore.FieldValue.serverTimestamp()
    });
    $("rev-name").value = ""; $("rev-text").value = "";
    myRating = 0; [...$("star-input").children].forEach((b) => b.classList.remove("on"));
    toast("Thanks for your review!");
  } catch (e) { toast("Could not post: " + e.message, "err"); }
  btn.disabled = false;
}


/* =================== ADMIN PAGE =================== */
let currentShots = [];
let filled = false;

if ($("login-section")) {
  if (sessionStorage.getItem("zyncAdmin")) showDash();
  $("admin-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });
}

function login() {
  if ($("admin-user").value === "skedz" && $("admin-pass").value === "5023") {
    sessionStorage.setItem("zyncAdmin", "1");
    showDash();
  } else toast("Wrong username or password", "err");
}

function logout() { 
  sessionStorage.removeItem("zyncAdmin"); 
  location.reload(); 
}

function showDash() {
  $("login-section").style.display = "none";
  $("dashboard-section").style.display = "block";
  
  appDocRef.onSnapshot((doc) => {
    const d = doc.exists ? doc.data() : {};
    if (!filled) {
      filled = true;
      $("a-name").value = d.name || ""; $("a-dev").value = d.dev || "";
      $("dl-link").value = d.link || ""; $("admin-desc").value = d.desc || "";
      $("a-icon").value = d.icon || "";
    }
    if (d.icon) $("icon-preview").src = d.icon;
    currentShots = d.screenshots || [];
    const grid = $("shot-grid");
    grid.innerHTML = currentShots.length ? "" : '<p class="empty">No screenshots yet.</p>';
    currentShots.forEach((u, i) => {
      const w = document.createElement("div");
      w.className = "thumb";
      w.innerHTML = `<img src="${esc(u)}" alt=""><button title="Remove" onclick="removeShot(${i})">×</button>`;
      grid.appendChild(w);
    });
  });

  reviewsRef.orderBy("ts", "desc").onSnapshot((snap) => {
    const box = $("admin-reviews");
    box.innerHTML = snap.size ? "" : '<p class="empty">No reviews yet.</p>';
    snap.forEach((doc) => {
      const r = doc.data();
      const el = document.createElement("div");
      el.className = "review";
      el.innerHTML = `<div class="review-top"><b>${esc(r.name)}</b><span class="stars-s">${starStr(r.rating || 0)}</span></div><p>${esc(r.text)}</p><button class="btn-small danger" onclick="deleteReview('${doc.id}')">Delete</button>`;
      box.appendChild(el);
    });
  });
}

function saveInfo() {
  appDocRef.set({
    name: $("a-name").value.trim(), dev: $("a-dev").value.trim(),
    link: $("dl-link").value.trim(), desc: $("admin-desc").value.trim(),
    icon: $("a-icon").value.trim()
  }, { merge: true }).then(() => toast("Saved")).catch((e) => toast(e.message, "err"));
}

async function uploadIcon() {
  const f = $("icon-file").files[0];
  if (!f) return toast("Choose an icon image first", "err");
  const s = $("icon-status"); s.textContent = "Uploading icon...";
  try {
    const url = await uploadToImgBB(f);
    $("a-icon").value = url;
    await appDocRef.set({ icon: url }, { merge: true });
    s.textContent = ""; $("icon-file").value = "";
    toast("App icon updated");
  } catch (e) { s.textContent = ""; toast("Icon upload failed: " + e.message, "err"); }
}

function addImageUrl() {
  const url = $("img-url-input").value.trim();
  if (!url) return toast("Paste an image URL first", "err");
  appDocRef.set({ screenshots: firebase.firestore.FieldValue.arrayUnion(url) }, { merge: true })
    .then(() => { $("img-url-input").value = ""; toast("Screenshot added"); })
    .catch((e) => toast(e.message, "err"));
}

function previewFiles() {
  const box = $("upload-preview"); box.innerHTML = "";
  [...$("img-upload").files].forEach((f) => {
    const img = document.createElement("img"); img.src = URL.createObjectURL(f); box.appendChild(img);
  });
}

async function uploadImage() {
  const files = [...$("img-upload").files];
  if (!files.length) return toast("Select at least one image", "err");
  const s = $("upload-status"), urls = [], failed = [];
  $("upload-btn").disabled = true;
  for (let i = 0; i < files.length; i++) {
    s.textContent = `Uploading ${i + 1} of ${files.length}...`;
    try { urls.push(await uploadToImgBB(files[i])); }
    catch (e) { failed.push(files[i].name + " (" + e.message + ")"); }
  }
  if (urls.length) {
    try {
      await appDocRef.set({ screenshots: firebase.firestore.FieldValue.arrayUnion(...urls) }, { merge: true });
      toast(`${urls.length} screenshot${urls.length > 1 ? "s" : ""} added`);
      $("img-upload").value = ""; $("upload-preview").innerHTML = "";
    } catch (e) { toast("Firebase: " + e.message, "err"); }
  }
  s.textContent = failed.length ? "Failed: " + failed.join(", ") : "";
  if (failed.length) toast(failed.length + " upload(s) failed", "err");
  $("upload-btn").disabled = false;
}

function removeShot(i) {
  if (!confirm("Remove this screenshot?")) return;
  appDocRef.update({ screenshots: firebase.firestore.FieldValue.arrayRemove(currentShots[i]) })
    .then(() => toast("Removed")).catch((e) => toast(e.message, "err"));
}

function deleteReview(id) {
  if (confirm("Delete this review?")) reviewsRef.doc(id).delete().then(() => toast("Review deleted")).catch((e) => toast(e.message, "err"));
}