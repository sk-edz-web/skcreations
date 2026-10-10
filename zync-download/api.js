// ---------- Firebase ----------
const firebaseConfig = {
  apiKey: "AIzaSyD4FPU1uapSWjbpyR1Jjf854T7V4qMV-TM",
  authDomain: "skedz-a13eb.firebaseapp.com",
  databaseURL: "https://skedz-a13eb-default-rtdb.firebaseio.com",
  projectId: "skedz-a13eb",
  storageBucket: "skedz-a13eb.firebasestorage.app",
  messagingSenderId: "318431223204",
  appId: "1:318431223204:web:7b5f4b84f41ede9b1eb531",
  measurementId: "G-J3H166TM0P"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---------- ImgBB ----------
// NOTE: ImgBB keys are exactly 32 characters. Your old key had an extra "Y" at the
// start (33 chars) - that is why uploads were failing. Fixed here.
const IMGBB_API_KEY = "d52834a6dd5b38108a1abaf081dec54d";

// Uploads one file, returns the hosted URL. Throws a readable error if it fails.
async function uploadToImgBB(file) {
  const formData = new FormData();
  formData.append("image", file);
  const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: "POST",
    body: formData
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error((data.error && data.error.message) || "ImgBB upload failed");
  }
  return data.data.url;
}