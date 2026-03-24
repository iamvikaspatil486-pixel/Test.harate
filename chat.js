const supabaseUrl = "https://ntfglwfrhljjkzecifuh.supabase.co";
const supabaseKey = "YOUR_KEY";
window.db = window.supabase.createClient(supabaseUrl, supabaseKey);

document.addEventListener("DOMContentLoaded", () => {

const input = document.getElementById("msgInput")
const sendBtn = document.getElementById("sendBtn")
const voiceBtn = document.getElementById("voiceBtn")
const messages = document.querySelector(".messages")
const fileInput = document.querySelector('input[type="file"]')
const gifBtn = document.getElementById("gifBtn")

const db = window.db

/* USER */
let storedUser = JSON.parse(localStorage.getItem("anon_user") || "null")
const username = storedUser?.name || "User_" + Math.floor(Math.random()*1000)
const userId = storedUser?.id || crypto.randomUUID()

let replyToMessage = null
let longPressTimer = null

/* ========================= */
/* 🔥 FIX MESSAGE HIDE */
/* ========================= */

function adjustPadding(){
const bottomBar = document.querySelector(".bottom-chat")
if(bottomBar){
messages.style.paddingBottom = bottomBar.offsetHeight + 15 + "px"
}
}
window.addEventListener("load", adjustPadding)
window.addEventListener("resize", adjustPadding)
setTimeout(adjustPadding, 300)

/* ========================= */
/* INPUT UI */
/* ========================= */

function updateInputUI(){
if(input.value.trim() !== ""){
sendBtn.style.display = "inline-block"
voiceBtn.style.display = "none"
}else{
sendBtn.style.display = "none"
voiceBtn.style.display = "inline-block"
}
}
input.addEventListener("input", updateInputUI)
updateInputUI()

/* ========================= */
/* DISPLAY MESSAGE */
/* ========================= */

function displayMessage(msg){

const div = document.createElement("div")
div.className = "mb-3"
div.dataset.id = msg.id

let replyHTML = msg.reply_to
? `<div style="font-size:12px;opacity:0.7;border-left:2px solid #3b82f6;padding-left:6px;margin-bottom:4px;">Reply: ${msg.reply_to}</div>`
: ""

let mediaHTML = msg.media_url
? `<img src="${msg.media_url}" style="max-width:200px;border-radius:10px;margin-top:5px;">`
: ""

div.innerHTML = `
<div style="font-size:11px;color:#9ca3af;">${msg.username}</div>
${replyHTML}
<div style="background:#1e293b;color:white;padding:10px;border-radius:14px;display:inline-block;max-width:80%;">
${msg.message || ""}
${mediaHTML}
</div>
`

/* 🔥 SWIPE REPLY */
let startX = 0

div.addEventListener("touchstart", (e) => {
startX = e.touches[0].clientX

longPressTimer = setTimeout(() => {
showReactions(msg.id)
}, 500)
})

div.addEventListener("touchmove", (e) => {
let moveX = e.touches[0].clientX - startX

if(moveX > 80){
replyToMessage = msg.message
input.placeholder = "Replying..."
div.style.transform = "translateX(20px)"
}
})

div.addEventListener("touchend", () => {
div.style.transform = "translateX(0)"
clearTimeout(longPressTimer)
})

messages.appendChild(div)
messages.scrollTop = messages.scrollHeight

loadReactions(msg.id, div)
}

/* ========================= */
/* SEND MESSAGE */
/* ========================= */

async function sendMessage(){

const text = input.value.trim()
if(text === "") return

displayMessage({
id: Date.now(),
username,
message: text,
reply_to: replyToMessage
})

await db.from("chat_messages").insert({
user_id: userId,
username,
message: text,
reply_to: replyToMessage
})

input.value = ""
replyToMessage = null
input.placeholder = "Message..."
updateInputUI()
}

/* ========================= */
/* IMAGE UPLOAD */
/* ========================= */

fileInput.addEventListener("change", async (e) => {

const file = e.target.files[0]
if(!file) return

const fileName = `chat/${Date.now()}-${file.name}`

const { error } = await db.storage
.from("chat-images")
.upload(fileName, file)

if(error){
alert("Upload failed")
return
}

const { data } = db.storage.from("chat-images").getPublicUrl(fileName)
const url = data.publicUrl

displayMessage({
id: Date.now(),
username,
media_url: url
})

await db.from("chat_messages").insert({
user_id: userId,
username,
media_url: url
})

})

/* ========================= */
/* LOAD MESSAGES */
/* ========================= */

async function loadMessages(){

const { data } = await db
.from("chat_messages")
.select("*")
.order("created_at", { ascending: true })

messages.innerHTML = ""
data.forEach(displayMessage)
}
loadMessages()

/* ========================= */
/* REALTIME */
/* ========================= */

db.channel("chat")
.on("postgres_changes",
{ event: "INSERT", schema: "public", table: "chat_messages" },
(payload) => {
if(payload.new.user_id !== userId){
displayMessage(payload.new)
}
})
.subscribe()

/* ========================= */
/* REACTIONS */
/* ========================= */

function showReactions(messageId){

document.getElementById("reaction-overlay")?.remove()

const overlay = document.createElement("div")
overlay.id = "reaction-overlay"
overlay.style.position = "fixed"
overlay.style.inset = "0"
overlay.style.zIndex = "999"

overlay.onclick = () => overlay.remove()

const picker = document.createElement("div")
picker.style.position = "fixed"
picker.style.bottom = "100px"
picker.style.left = "50%"
picker.style.transform = "translateX(-50%)"
picker.style.background = "#1e293b"
picker.style.padding = "10px"
picker.style.borderRadius = "20px"
picker.style.display = "flex"
picker.style.gap = "10px"

const emojis = ["❤️","😂","🔥","👍"]

emojis.forEach(emoji => {

const btn = document.createElement("span")
btn.innerText = emoji

btn.onclick = async (e) => {
e.stopPropagation()

await db.from("reactions").delete()
.eq("message_id", messageId)
.eq("user_id", userId)

await db.from("reactions").insert({
message_id: messageId,
user_id: userId,
emoji
})

overlay.remove()
}

picker.appendChild(btn)
})

overlay.appendChild(picker)
document.body.appendChild(overlay)
}

/* LOAD REACTIONS */

async function loadReactions(messageId, container){

const { data } = await db
.from("reactions")
.select("emoji")
.eq("message_id", messageId)

if(!data) return

container.querySelector(".reaction-box")?.remove()

const counts = {}

data.forEach(r => {
counts[r.emoji] = (counts[r.emoji] || 0) + 1
})

const div = document.createElement("div")
div.className = "reaction-box"
div.style.display = "flex"
div.style.gap = "6px"

Object.keys(counts).forEach(e => {
const span = document.createElement("span")
span.innerText = `${e} ${counts[e]}`
div.appendChild(span)
})

container.appendChild(div)
}

/* ========================= */
/* GIF BUTTON */
/* ========================= */

gifBtn.onclick = openGifPicker

async function openGifPicker(){

const overlay = document.createElement("div")
overlay.style.position = "fixed"
overlay.style.inset = "0"
overlay.style.background = "rgba(0,0,0,0.8)"
overlay.style.zIndex = "999"

const box = document.createElement("div")
box.style.position = "absolute"
box.style.bottom = "0"
box.style.width = "100%"
box.style.height = "50%"
box.style.background = "#0f172a"
box.style.overflowY = "scroll"

overlay.appendChild(box)
document.body.appendChild(overlay)

const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=YOUR_API_KEY&limit=20`)
const data = await res.json()

data.data.forEach(gif => {
const img = document.createElement("img")
img.src = gif.images.fixed_height.url
img.style.width = "100px"

img.onclick = async () => {

displayMessage({
id: Date.now(),
username,
media_url: img.src
})

await db.from("chat_messages").insert({
user_id: userId,
username,
media_url: img.src
})

overlay.remove()
}

box.appendChild(img)
})

overlay.onclick = () => overlay.remove()
}

/* EVENTS */

input.addEventListener("keydown", e => {
if(e.key === "Enter") sendMessage()
})

sendBtn.addEventListener("click", sendMessage)

})
