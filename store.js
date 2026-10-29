const appsRef = db.collection("apps");

let apps = [];
let loaded = false;
let currentId = null;
let unsubReviews = null;
let myRating = 0;

const lightbox = $("lightbox");
const track = $("lb-track");

const routeId = () => {
  const m = location.hash.match(/^#\/app\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
};
const getApp = (id) => apps.find((a) => a.id === id);

appsRef.onSnapshot(
  (snap) => {
    apps = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt));
    loaded = true;
    render();
  },
  (err) => {
    loaded = true;
    $("app-grid").innerHTML = `<p class="empty">Could not load apps: ${esc(err.message)}</p>`;
  }
);

window.addEventListener("hashchange", () => {
  window.scrollTo(0, 0);
  render();
});

$("search").addEventListener("input", () => {
  if (routeId()) location.hash = "#/";
  else renderHome();
});

function render() {
  const id = routeId();
  $("home-view").hidden = !!id;
  $("detail-view").hidden = !id;
  if (id) {
    renderDetail(id);
  } else {
    stopReviews();
    document.title = "Zync Store";
    renderHome();
  }
}

function renderHome() {
  const grid = $("app-grid");
  if (!loaded) {
    grid.innerHTML = '<p class="empty">Loading apps...</p>';
    return;
  }
  const q = $("search").value.trim().toLowerCase();
  const list = apps.filter((a) => [a.name, a.dev, a.category].join(" ").toLowerCase().includes(q));
  if (!list.length) {
    grid.innerHTML = `<p class="empty">${apps.length ? "No apps match your search." : "No apps published yet."}</p>`;
    return;
  }
  grid.innerHTML = list.map(cardHtml).join("");
}

function cardHtml(a) {
  const avg = avgOf(a);
  const meta = [a.category, avg ? `★ ${avg}` : "No ratings"].filter(Boolean).map(esc).join(" · ");
  return `<a class="app-card" href="#/app/${encodeURIComponent(a.id)}">
    <img class="app-logo" src="${iconOf(a)}" alt="" loading="lazy">
    <div class="grow">
      <h3>${esc(a.name)}</h3>
      <p class="developer">${esc(a.dev)}</p>
      <p class="muted">${meta}</p>
    </div>
  </a>`;
}

function infoRow(label, value) {
  return value ? `<div class="info-row"><span>${label}</span><b>${esc(value)}</b></div>` : "";
}

function detailHtml(a) {
  const shots = a.screenshots || [];
  const link = safeUrl(a.link);
  const avg = avgOf(a);
  const updated = fmtDate(a.updatedAt);
  const released = fmtDate(a.createdAt);
  const whatsNewText = a.whatsNew ? `<p class="pre">${esc(a.whatsNew)}</p>` : "";
  const whatsNewMeta = [a.version ? `Version ${esc(a.version)}` : "", updated ? `Updated ${updated}` : ""]
    .filter(Boolean)
    .join(" · ");

  return `
    <header class="detail-head">
      <img class="app-logo lg" src="${iconOf(a)}" alt="">
      <div class="grow">
        <h1 class="neon-text">${esc(a.name)}</h1>
        <p class="developer">${esc(a.dev)}</p>
        ${a.category ? `<p class="muted">${esc(a.category)}</p>` : ""}
      </div>
    </header>

    <div class="stats">
      <div><b>${avg ? avg + " ★" : "–"}</b><span>${a.ratingCount || 0} reviews</span></div>
      <div><b>${esc(a.size || "–")}</b><span>Size</span></div>
      <div><b>${esc(a.version || "–")}</b><span>Version</span></div>
    </div>

    <a class="btn ${link ? "" : "disabled"}" href="${link ? esc(link) : "#"}" rel="noopener">Download</a>

    <div class="shots">
      ${
        shots.length
          ? shots
              .map((u, i) => `<img class="shot" src="${esc(u)}" loading="lazy" alt="Screenshot ${i + 1}" data-i="${i}">`)
              .join("")
          : '<p class="empty">No screenshots yet.</p>'
      }
    </div>

    <section class="block">
      <h3>About this app</h3>
      <p class="pre">${esc(a.desc || "No description yet.")}</p>
    </section>

    ${
      whatsNewMeta || whatsNewText
        ? `<section class="block"><h3>What's new</h3><p class="muted">${whatsNewMeta}</p>${whatsNewText}</section>`
        : ""
    }

    <section class="block">
      <h3>App info</h3>
      <div class="info">
        ${infoRow("Version", a.version)}
        ${infoRow("Updated on", updated)}
        ${infoRow("Released on", released)}
        ${infoRow("Size", a.size)}
        ${infoRow("Category", a.category)}
        ${infoRow("Developer", a.dev)}
      </div>
    </section>`;
}

function renderDetail(id) {
  const box = $("detail-main");
  const a = getApp(id);

  if (!loaded || !a) {
    stopReviews();
    $("reviews-block").hidden = true;
    box.innerHTML = `<p class="empty">${loaded ? "App not found." : "Loading..."}</p>`;
    return;
  }

  document.title = a.name + " - Zync Store";
  box.innerHTML = detailHtml(a);
  box.querySelectorAll(".shot").forEach((img) => {
    img.onclick = () => openLightbox(+img.dataset.i);
  });
  $("reviews-block").hidden = false;

  if (currentId !== id) {
    $("rev-name").value = "";
    $("rev-text").value = "";
    myRating = 0;
    paintStars(0);
    watchReviews(id);
  }
}

function stopReviews() {
  if (unsubReviews) unsubReviews();
  unsubReviews = null;
  currentId = null;
}

function watchReviews(id) {
  stopReviews();
  currentId = id;
  unsubReviews = appsRef
    .doc(id)
    .collection("reviews")
    .orderBy("ts", "desc")
    .onSnapshot((snap) => {
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
}

const starBox = $("star-input");
starBox.innerHTML = [1, 2, 3, 4, 5]
  .map((n) => `<button type="button" data-v="${n}" aria-label="${n} star">★</button>`)
  .join("");

function paintStars(v) {
  [...starBox.children].forEach((b, i) => b.classList.toggle("on", i < v));
}

starBox.onclick = (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  myRating = +b.dataset.v;
  paintStars(myRating);
  b.classList.add("pop");
  setTimeout(() => b.classList.remove("pop"), 350);
};
starBox.onmouseover = (e) => {
  const b = e.target.closest("button");
  if (b) paintStars(+b.dataset.v);
};
starBox.onmouseleave = () => paintStars(myRating);

$("review-submit").onclick = async () => {
  if (!currentId) return;
  if (!myRating) return toast("Tap a star to rate first", "err");
  const btn = $("review-submit");
  btn.disabled = true;
  try {
    const appRef = appsRef.doc(currentId);
    const batch = db.batch();
    batch.set(appRef.collection("reviews").doc(), {
      rating: myRating,
      name: $("rev-name").value.trim().slice(0, 40) || "Anonymous",
      text: $("rev-text").value.trim().slice(0, 500),
      ts: FieldValue.serverTimestamp()
    });
    batch.update(appRef, {
      ratingSum: FieldValue.increment(myRating),
      ratingCount: FieldValue.increment(1)
    });
    await batch.commit();
    $("rev-name").value = "";
    $("rev-text").value = "";
    myRating = 0;
    paintStars(0);
    toast("Thanks for your review!");
  } catch (e) {
    toast("Could not post: " + e.message, "err");
  }
  btn.disabled = false;
};

const lbIndex = () => Math.round(track.scrollLeft / track.clientWidth);

function updateLightbox() {
  const total = track.children.length;
  const i = lbIndex();
  $("lb-count").textContent = `${i + 1} / ${total}`;
  $("lb-prev").hidden = i <= 0;
  $("lb-next").hidden = i >= total - 1;
}

function openLightbox(index) {
  const a = getApp(currentId);
  if (!a || !(a.screenshots || []).length) return;
  track.innerHTML = a.screenshots
    .map((u) => `<div class="slide"><img src="${esc(u)}" alt="Screenshot" draggable="false"></div>`)
    .join("");
  lightbox.classList.add("open");
  document.body.style.overflow = "hidden";
  track.style.scrollBehavior = "auto";
  track.scrollLeft = index * track.clientWidth;
  track.style.scrollBehavior = "";
  updateLightbox();
}

function closeLightbox() {
  lightbox.classList.remove("open");
  document.body.style.overflow = "";
}

function slideBy(step) {
  track.scrollTo({ left: (lbIndex() + step) * track.clientWidth, behavior: "smooth" });
}

track.addEventListener("scroll", updateLightbox, { passive: true });
track.addEventListener("click", (e) => {
  if (e.target.tagName !== "IMG") closeLightbox();
});
$("lb-close").onclick = closeLightbox;
$("lb-prev").onclick = () => slideBy(-1);
$("lb-next").onclick = () => slideBy(1);

document.addEventListener("keydown", (e) => {
  if (!lightbox.classList.contains("open")) return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") slideBy(-1);
  if (e.key === "ArrowRight") slideBy(1);
});

window.addEventListener("resize", () => {
  if (lightbox.classList.contains("open")) updateLightbox();
});