const appsRef = db.collection("apps");
const legacyRef = db.collection("appData").doc("zync");

let apps = [];
let form = { id: null, icon: "", shots: [] };
let unsubApps = null;
let unsubReviews = null;
let busy = false;

if (sessionStorage.getItem("zyncAdmin")) showDashboard();

$("login-btn").onclick = login;
$("admin-pass").addEventListener("keydown", (e) => {
  if (e.key === "Enter") login();
});
$("logout-btn").onclick = () => {
  sessionStorage.removeItem("zyncAdmin");
  location.reload();
};

function login() {
  if ($("admin-user").value === "skedz" && $("admin-pass").value === "5023") {
    sessionStorage.setItem("zyncAdmin", "1");
    showDashboard();
  } else {
    toast("Wrong username or password", "err");
  }
}

function showDashboard() {
  $("login-section").hidden = true;
  $("dashboard-section").hidden = false;
  unsubApps = appsRef.onSnapshot(
    (snap) => {
      apps = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => millis(b.updatedAt) - millis(a.updatedAt));
      renderManage();
    },
    (e) => toast(e.message, "err")
  );
  checkLegacy();
  openEditor(null);
}

function showView(view) {
  $("manage-view").hidden = view !== "manage";
  $("editor-view").hidden = view === "manage";
  $("tab-new").classList.toggle("active", view === "new");
  $("tab-manage").classList.toggle("active", view !== "new");
}

$("tab-new").onclick = () => openEditor(null);
$("tab-manage").onclick = () => {
  stopReviews();
  showView("manage");
};
$("editor-back").onclick = $("tab-manage").onclick;

function renderManage() {
  const q = $("manage-search").value.trim().toLowerCase();
  const list = apps.filter((a) => [a.name, a.dev, a.category].join(" ").toLowerCase().includes(q));
  const box = $("manage-list");
  if (!list.length) {
    box.innerHTML = `<p class="empty">${apps.length ? "No apps match your search." : "No apps yet. Use Upload app to add your first one."}</p>`;
    return;
  }
  box.innerHTML = list
    .map((a) => {
      const avg = avgOf(a);
      const meta = [a.version ? "v" + a.version : "", "Updated " + fmtDate(a.updatedAt), avg ? `★ ${avg} (${a.ratingCount})` : "No ratings"]
        .filter(Boolean)
        .map(esc)
        .join(" · ");
      return `<div class="manage-row">
        <img class="app-logo sm" src="${iconOf(a)}" alt="">
        <div class="grow"><b>${esc(a.name)}</b><div class="muted">${meta}</div></div>
        <button class="btn-small" data-edit="${esc(a.id)}">Edit</button>
        <button class="btn-small danger" data-del="${esc(a.id)}">Delete</button>
      </div>`;
    })
    .join("");
}

$("manage-search").addEventListener("input", renderManage);

$("manage-list").addEventListener("click", (e) => {
  const edit = e.target.closest("[data-edit]");
  const del = e.target.closest("[data-del]");
  if (edit) openEditor(apps.find((a) => a.id === edit.dataset.edit));
  if (del) deleteApp(del.dataset.del);
});

function openEditor(a) {
  form = { id: a ? a.id : null, icon: a ? a.icon || "" : "", shots: a ? [...(a.screenshots || [])] : [] };
  $("f-name").value = a ? a.name || "" : "";
  $("f-dev").value = a ? a.dev || "" : "";
  $("f-category").value = a ? a.category || "" : "";
  $("f-size").value = a ? a.size || "" : "";
  $("f-link").value = a ? a.link || "" : "";
  $("f-desc").value = a ? a.desc || "" : "";
  $("f-version").value = a ? a.version || "" : "";
  $("f-new").value = a ? a.whatsNew || "" : "";
  $("f-icon").value = "";
  $("f-shots").value = "";
  $("upload-preview").innerHTML = "";
  $("save-status").textContent = "";
  $("icon-preview").src = form.icon && safeUrl(form.icon) ? form.icon : PLACEHOLDER;
  $("editor-title").textContent = a ? "Edit " + (a.name || "app") : "Upload a new app";
  $("save-btn").textContent = a ? "Save changes" : "Publish app";
  $("update-btn").hidden = !a;
  $("editor-back").hidden = !a;
  $("reviews-panel").hidden = !a;
  renderShots();
  stopReviews();
  if (a) watchReviews(a.id);
  showView(a ? "edit" : "new");
  window.scrollTo(0, 0);
}

function renderShots() {
  const grid = $("shot-grid");
  grid.innerHTML = form.shots.length ? "" : '<p class="empty">No screenshots yet.</p>';
  form.shots.forEach((u, i) => {
    const w = document.createElement("div");
    w.className = "thumb";
    w.innerHTML = `<img src="${esc(u)}" alt=""><button type="button" title="Remove" data-rm="${i}">×</button>`;
    grid.appendChild(w);
  });
}

$("shot-grid").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rm]");
  if (!b) return;
  form.shots.splice(+b.dataset.rm, 1);
  renderShots();
});

$("f-icon").onchange = () => {
  const f = $("f-icon").files[0];
  if (f) $("icon-preview").src = URL.createObjectURL(f);
};

$("f-shots").onchange = () => {
  const box = $("upload-preview");
  box.innerHTML = "";
  [...$("f-shots").files].forEach((f) => {
    const img = document.createElement("img");
    img.src = URL.createObjectURL(f);
    box.appendChild(img);
  });
};

function setBusy(on) {
  busy = on;
  $("save-btn").disabled = on;
  $("update-btn").disabled = on;
}

async function save(isUpdate) {
  if (busy) return;
  const name = $("f-name").value.trim();
  if (!name) return toast("App name is required", "err");
  if (isUpdate && !$("f-version").value.trim()) return toast("Enter the new version number first", "err");

  const status = $("save-status");
  setBusy(true);
  try {
    let icon = form.icon;
    const iconFile = $("f-icon").files[0];
    if (iconFile) {
      status.textContent = "Uploading icon...";
      icon = await uploadToImgBB(iconFile);
    }

    const shots = [...form.shots];
    const files = [...$("f-shots").files];
    for (let i = 0; i < files.length; i++) {
      status.textContent = `Uploading screenshot ${i + 1} of ${files.length}...`;
      shots.push(await uploadToImgBB(files[i]));
    }

    status.textContent = "Saving...";
    const data = {
      name,
      dev: $("f-dev").value.trim(),
      category: $("f-category").value.trim(),
      size: $("f-size").value.trim(),
      link: $("f-link").value.trim(),
      desc: $("f-desc").value.trim(),
      version: $("f-version").value.trim(),
      whatsNew: $("f-new").value.trim(),
      icon,
      screenshots: shots
    };

    if (form.id) {
      if (isUpdate) data.updatedAt = FieldValue.serverTimestamp();
      await appsRef.doc(form.id).set(data, { merge: true });
      toast(isUpdate ? "Update published" : "Changes saved");
    } else {
      data.createdAt = FieldValue.serverTimestamp();
      data.updatedAt = FieldValue.serverTimestamp();
      data.ratingSum = 0;
      data.ratingCount = 0;
      await appsRef.add(data);
      toast("App published");
    }
    status.textContent = "";
    stopReviews();
    showView("manage");
  } catch (e) {
    status.textContent = "";
    toast("Failed: " + e.message, "err");
  }
  setBusy(false);
}

$("save-btn").onclick = () => save(false);
$("update-btn").onclick = () => save(true);

async function deleteApp(id) {
  const a = apps.find((x) => x.id === id);
  if (!a || !confirm(`Delete "${a.name}" and all its reviews?`)) return;
  try {
    const revs = await appsRef.doc(id).collection("reviews").get();
    const batch = db.batch();
    revs.forEach((r) => batch.delete(r.ref));
    batch.delete(appsRef.doc(id));
    await batch.commit();
    toast("App deleted");
  } catch (e) {
    toast(e.message, "err");
  }
}

function stopReviews() {
  if (unsubReviews) unsubReviews();
  unsubReviews = null;
}

function watchReviews(id) {
  unsubReviews = appsRef
    .doc(id)
    .collection("reviews")
    .orderBy("ts", "desc")
    .onSnapshot((snap) => {
      const box = $("admin-reviews");
      box.innerHTML = snap.size ? "" : '<p class="empty">No reviews yet.</p>';
      snap.forEach((doc) => {
        const r = doc.data();
        const el = document.createElement("div");
        el.className = "review";
        el.innerHTML = `<div class="review-top"><b>${esc(r.name)}</b><span class="stars-s">${starStr(r.rating || 0)}</span></div><p>${esc(r.text)}</p><button class="btn-small danger" data-rev="${esc(doc.id)}" data-rating="${r.rating || 0}">Delete</button>`;
        box.appendChild(el);
      });
    });
}

$("admin-reviews").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-rev]");
  if (!b || !form.id || !confirm("Delete this review?")) return;
  const appRef = appsRef.doc(form.id);
  const batch = db.batch();
  batch.delete(appRef.collection("reviews").doc(b.dataset.rev));
  batch.update(appRef, {
    ratingSum: FieldValue.increment(-(+b.dataset.rating)),
    ratingCount: FieldValue.increment(-1)
  });
  try {
    await batch.commit();
    toast("Review deleted");
  } catch (err) {
    toast(err.message, "err");
  }
});

async function checkLegacy() {
  try {
    const doc = await legacyRef.get();
    $("migrate-box").hidden = !(doc.exists && !doc.data().migrated);
  } catch (e) {
    $("migrate-box").hidden = true;
  }
}

$("migrate-btn").onclick = async () => {
  try {
    const old = await legacyRef.get();
    const d = old.data();
    const revs = await legacyRef.collection("reviews").get();
    let sum = 0;
    revs.forEach((r) => (sum += r.data().rating || 0));

    const ref = appsRef.doc();
    const ts = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.set(ref, {
      name: d.name || "ZYNC",
      dev: d.dev || "",
      category: "",
      size: "",
      version: "1.0",
      whatsNew: "",
      link: d.link || "",
      desc: d.desc || "",
      icon: d.icon || "",
      screenshots: d.screenshots || [],
      ratingSum: sum,
      ratingCount: revs.size,
      createdAt: ts,
      updatedAt: ts
    });
    revs.forEach((r) => batch.set(ref.collection("reviews").doc(r.id), r.data()));
    batch.update(legacyRef, { migrated: true });
    await batch.commit();
    $("migrate-box").hidden = true;
    toast("Old app imported");
  } catch (e) {
    toast("Import failed: " + e.message, "err");
  }
};