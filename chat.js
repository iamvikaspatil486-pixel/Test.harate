document.addEventListener("DOMContentLoaded", () => {

const input = document.getElementById("msgInput")
const sendBtn = document.getElementById("sendBtn")
const voiceBtn = document.getElementById("voiceBtn")
const messages = document.querySelector(".messages")
const fileInput = document.querySelector('input[type="file"]')
const gifBtn = document.getElementById("gifBtn")

if(!input || !sendBtn || !messages){
console.error("UI elements missing")
return
}

const db = window.db

/* ========================= */
/* USER */
/* ========================= */

let storedUser = null
try{
storedUser = JSON.parse(localStorage.getItem("anon_user"))
}catch(e){}

if(!storedUser){
const name = prompt("Enter your name") || "User_" + Math.floor(Math.random()*1000)
storedUser = { name, id: crypto.randomUUID() }
localStorage.setItem("anon_user", JSON.stringify(storedUser))
}

const username = storedUser.name
const userId = storedUser.id

let longPressTimer = null
let replyTo = null

/* ========================= */
/* IMAGE UPLOAD */
/* ========================= */

fileInput.addEventListener("change", async (e) => {

const file = e.target.files[0]
if (!file) return

const fileName = `chat/${Date.now()}-${file.name}`

const { error } = await db.storage
.from("chat-images")
.upload(fileName, file)

if (error) {
console.error(error)
alert("Image upload failed")
return
}

const { data } = db.storage
.from("chat-images")
.getPublicUrl(fileName)

const url = data.publicUrl

displayMessage({
id: Date.now(),
username,
media_url: url
})

await db.from("chat_messages").insert({
user_id: userId,
username,
media_url: url,
reply_to: replyTo
})

replyTo = null
fileInput.value = ""
})

/* ========================= */
/* GIPHY */
/* ========================= */

const GIPHY_API_KEY = "YOUR_API_KEY_HERE"

gifBtn.onclick = openGifPicker

async function openGifPicker(){

const overlay = document.createElement("div")
overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);z-index:999"

const box = document.createElement("div")
box.style = "position:absolute;bottom:0;width:100%;height:50%;background:#0f172a;overflow-y:scroll;padding:10px"

overlay.appendChild(box)
document.body.appendChild(overlay)

const res = await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20`)
const data = await res.json()

data.data.forEach(gif => {

const img = document.createElement("img")
img.src = gif.images.fixed_height.url
img.style = "width:100px;margin:5px;border-radius:10px"

img.onclick = async () => {

displayMessage({
id: Date.now(),
username,
media_url: gif.images.fixed_height.url
})

await db.from("chat_messages").insert({
user_id: userId,
username,
media_url: gif.images.fixed_height.url,
reply_to: replyTo
})

replyTo = null
overlay.remove()
}

box.appendChild(img)
})

overlay.onclick = () => overlay.remove()
}

/* ========================= */
/* DISPLAY MESSAGE */
/* ========================= */

function displayMessage(msg){

const div = document.createElement("div")
div.className = "mb-3"
div.setAttribute("data-id", msg.id)

let replyHTML = msg.reply_to
? `<div style="font-size:11px;color:#94a3b8;border-left:2px solid #3b82f6;padding-left:6px;margin-bottom:4px;">Reply: ${msg.reply_to}</div>`
: ""

let mediaHTML = msg.media_url
? `<img src="${msg.media_url}" style="max-width:200px;border-radius:10px;margin-top:5px;">`
: ""

div.innerHTML = `
<div style="font-size:11px;color:#9ca3af;">${msg.username}</div>
${replyHTML}
<div style="background:#1e293b;color:white;padding:10px 14px;border-radius:14px;display:inline-block;max-width:80%;">
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
const moveX = e.touches[0].clientX - startX

if(moveX > 80){
replyTo = msg.message || "Media"
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
/* SEND TEXT */
/* ========================= */

async function sendMessage(){

const text = input.value.trim()
if(text === "") return

displayMessage({
id: Date.now(),
username,
message: text,
reply_to: replyTo
})

await db.from("chat_messages").insert({
user_id: userId,
username,
message: text,
reply_to: replyTo
})

replyTo = null
input.placeholder = "Message..."
input.value = ""
}

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
/* REALTIME CHAT */
/* ========================= */

db.channel("live-chat")
.on("postgres_changes",
{ event: "INSERT", schema: "public", table: "chat_messages" },
(payload) => {
if(payload.new.user_id !== userId){
displayMessage(payload.new)
}
})
.subscribe()

/* ========================= */
/* 🔥 REALTIME REACTIONS FIX */
/* ========================= */

db.channel("reactions-live")
.on("postgres_changes",
{ event: "*", schema: "public", table: "reactions" },
() => {
refreshAllReactions()
})
.subscribe()

async function refreshAllReactions(){

const allMessages = document.querySelectorAll("[data-id]")

allMessages.forEach(msgDiv => {
const id = msgDiv.getAttribute("data-id")
loadReactions(id, msgDiv)
})
}

/* ========================= */
/* REACTIONS */
/* ========================= */

function showReactions(messageId){

const old = document.getElementById("reaction-overlay")
if(old) old.remove()

const emojis = ["❤️","😂","🖕","💯","🔥","👍",]

const overlay = document.createElement("div")
overlay.id = "reaction-overlay"
overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:998"

overlay.onclick = () => overlay.remove()

const picker = document.createElement("div")
picker.style = "position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:#1e293b;padding:10px;border-radius:20px;display:flex;gap:10px"

emojis.forEach(emoji => {

const btn = document.createElement("span")
btn.innerText = emoji
btn.style.fontSize = "22px"

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

/* ========================= */
/* LOAD REACTIONS */
/* ========================= */

async function loadReactions(messageId, container){

const { data } = await db
.from("reactions")
.select("emoji")
.eq("message_id", messageId)

if(!data) return

const old = container.querySelector(".reaction-box")
if(old) old.remove()

const counts = {}

data.forEach(r => {
counts[r.emoji] = (counts[r.emoji] || 0) + 1
})

if(Object.keys(counts).length === 0) return

const reactionDiv = document.createElement("div")
reactionDiv.className = "reaction-box"
reactionDiv.style = "display:flex;gap:6px;margin-top:4px"

Object.keys(counts).forEach(emoji => {
const span = document.createElement("span")
span.innerText = `${emoji} ${counts[emoji]}`
reactionDiv.appendChild(span)
})

container.appendChild(reactionDiv)
}

/* EVENTS */

input.addEventListener("keydown", e => {
if(e.key === "Enter") sendMessage()
})

sendBtn.addEventListener("click", sendMessage)

})
