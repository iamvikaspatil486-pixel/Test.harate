document.addEventListener("DOMContentLoaded", () => {

  const input       = document.getElementById("msgInput")
  const sendBtn     = document.getElementById("sendBtn")
  const voiceBtn    = document.getElementById("voiceBtn")
  const messages    = document.querySelector(".messages")
  const fileInput   = document.querySelector('input[type="file"]')
  const gifBtn      = document.getElementById("gifBtn")
  const replyPreview = document.getElementById("replyPreview")

  if (!input || !sendBtn || !messages) {
    console.error("UI elements missing")
    return
  }

  const db = window.db

  /* ========================= */
  /* USER                       */
  /* ========================= */

  let storedUser = null
  try {
    storedUser = JSON.parse(localStorage.getItem("anon_user"))
  } catch (e) {}

  if (!storedUser) {
    const name = prompt("Enter your name") || "User_" + Math.floor(Math.random() * 1000)
    storedUser = { name, id: crypto.randomUUID() }
    localStorage.setItem("anon_user", JSON.stringify(storedUser))
  }

  const username = storedUser.name
  const userId   = storedUser.id

  let longPressTimer = null
  let replyTo        = null

  /* ========================= */
  /* REPLY PREVIEW              */
  /* ========================= */

  function showReplyPreview(text) {
    replyTo = text
    replyPreview.style.display = "block"
    replyPreview.innerHTML = `↩ <strong>${text}</strong> <span id="cancelReply" style="float:right;cursor:pointer;color:#ef4444;">✕</span>`
    document.getElementById("cancelReply").onclick = clearReply
    input.placeholder = "Replying..."
    input.focus()
  }

  function clearReply() {
    replyTo = null
    replyPreview.style.display = "none"
    replyPreview.innerHTML = ""
    input.placeholder = "Message..."
  }

  /* ========================= */
  /* DISPLAY MESSAGE            */
  /* ========================= */

  function displayMessage(msg) {
    // Prevent duplicates
    if (document.querySelector(`[data-id="${msg.id}"]`)) return

    const div = document.createElement("div")
    div.className = "mb-3"
    div.setAttribute("data-id", msg.id)

    let replyHTML = msg.reply_to
      ? `<div style="font-size:11px;color:#94a3b8;border-left:2px solid #3b82f6;padding-left:6px;margin-bottom:4px;">↩ ${msg.reply_to}</div>`
      : ""

    let mediaHTML = msg.media_url
      ? `<img src="${msg.media_url}" style="max-width:200px;border-radius:10px;margin-top:5px;">`
      : ""

    div.innerHTML = `
      <div style="font-size:11px;color:#9ca3af;margin-bottom:2px;">${msg.username}</div>
      ${replyHTML}
      <div style="
        background:#1e293b;
        color:white;
        padding:10px 14px;
        border-radius:14px;
        display:inline-block;
        max-width:80%;
        text-align:left;
      ">
        ${msg.message || ""}
        ${mediaHTML}
      </div>
    `

    /* SWIPE + LONG PRESS */
    let startX = 0

    div.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX
      longPressTimer = setTimeout(() => {
        showReactions(msg.id)
      }, 500)
    })

    div.addEventListener("touchmove", (e) => {
      const moveX = e.touches[0].clientX - startX
      if (moveX > 80) {
        clearTimeout(longPressTimer) // ✅ FIX: cancel long press on swipe
        showReplyPreview(msg.message || "Media")
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
  /* LOAD HISTORY               */
  /* ========================= */

  async function loadHistory() {
    const { data, error } = await db
      .from("chat_messages")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(50)

    if (error) { console.error("History error:", error); return }
    data.forEach(displayMessage)
  }

  loadHistory()

  /* ========================= */
  /* SEND MESSAGE               */
  /* ========================= */

  async function sendMessage() {
    const text = input.value.trim()
    if (text === "") return

    const tempId = "temp-" + Date.now()

    // Optimistic local display
    displayMessage({
      id: tempId,
      user_id: userId,
      username,
      message: text,
      reply_to: replyTo
    })

    const { data, error } = await db.from("chat_messages").insert({
      user_id: userId,
      username,
      message: text,
      reply_to: replyTo
    }).select().single()

    if (!error && data) {
      // Replace temp message with real one (update data-id)
      const tempDiv = document.querySelector(`[data-id="${tempId}"]`)
      if (tempDiv) tempDiv.setAttribute("data-id", data.id)
    }

    clearReply()
    input.value = ""
  }

  /* ========================= */
  /* FILE / IMAGE UPLOAD        */
  /* ========================= */

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0]
    if (!file) return

    const ext  = file.name.split(".").pop()
    const path = `${userId}/${Date.now()}.${ext}`

    const { error: uploadError } = await db.storage
      .from("chat-media")
      .upload(path, file)

    if (uploadError) { console.error("Upload failed:", uploadError); return }

    const { data: urlData } = db.storage.from("chat-media").getPublicUrl(path)

    await db.from("chat_messages").insert({
      user_id: userId,
      username,
      message: "",
      media_url: urlData.publicUrl,
      reply_to: replyTo
    })

    clearReply()
    fileInput.value = ""
  })

  /* ========================= */
  /* VOICE RECORDING            */
  /* ========================= */

  let mediaRecorder = null
  let audioChunks   = []

  voiceBtn.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop()
      voiceBtn.textContent = "🎤"
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorder = new MediaRecorder(stream)
      audioChunks   = []

      mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data)

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: "audio/webm" })
        const path = `${userId}/voice-${Date.now()}.webm`

        const { error } = await db.storage.from("chat-media").upload(path, blob)
        if (error) { console.error("Voice upload failed:", error); return }

        const { data: urlData } = db.storage.from("chat-media").getPublicUrl(path)

        await db.from("chat_messages").insert({
          user_id: userId,
          username,
          message: "🎤 Voice message",
          media_url: urlData.publicUrl,
          reply_to: replyTo
        })

        clearReply()
        stream.getTracks().forEach(t => t.stop())
      }

      mediaRecorder.start()
      voiceBtn.textContent = "⏹"
    } catch (err) {
      console.error("Mic access denied:", err)
      alert("Microphone permission denied.")
    }
  })

  /* ========================= */
  /* REALTIME CHAT              */
  /* ========================= */

  db.channel("live-chat")
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "chat_messages" },
      (payload) => {
        if (payload.new.user_id !== userId) {
          displayMessage(payload.new)
        }
      })
    .subscribe()

  /* ========================= */
  /* REALTIME REACTIONS         */
  /* ========================= */

  db.channel("reactions-live")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "reactions" },
      (payload) => {
        // ✅ FIX: payload.new is null on DELETE — use old as fallback
        const reaction = payload.new || payload.old
        if (reaction) updateReactionUI(reaction)
      })
    .subscribe()

  function updateReactionUI(reaction) {
    const msgDiv = document.querySelector(`[data-id="${reaction.message_id}"]`)
    if (!msgDiv) return
    loadReactions(reaction.message_id, msgDiv)
  }

  /* ========================= */
  /* REACTIONS                  */
  /* ========================= */

  function showReactions(messageId) {
    const old = document.getElementById("reaction-overlay")
    if (old) old.remove()

    const emojis = ["❤️", "😂", "🔥", "👍", "💯"]

    const overlay = document.createElement("div")
    overlay.id = "reaction-overlay"
    overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:998;"
    overlay.onclick = () => overlay.remove()

    const picker = document.createElement("div")
    picker.style = "position:fixed;bottom:120px;left:50%;transform:translateX(-50%);background:#1e293b;padding:10px 16px;border-radius:20px;display:flex;gap:12px;box-shadow:0 8px 30px rgba(0,0,0,0.5);"

    emojis.forEach(emoji => {
      const btn = document.createElement("span")
      btn.innerText = emoji
      btn.style.cssText = "font-size:24px;cursor:pointer;transition:transform 0.15s;"
      btn.onmouseenter = () => btn.style.transform = "scale(1.3)"
      btn.onmouseleave = () => btn.style.transform = "scale(1)"

      btn.onclick = async (e) => {
        e.stopPropagation()

        // One reaction per user per message
        await db.from("reactions")
          .delete()
          .eq("message_id", messageId)
          .eq("user_id", userId)

        await db.from("reactions").insert({
          message_id: messageId,
          user_id: userId,
          emoji
        })

        updateReactionUI({ message_id: messageId })
        overlay.remove()
      }

      picker.appendChild(btn)
    })

    overlay.appendChild(picker)
    document.body.appendChild(overlay)
  }

  /* ========================= */
  /* LOAD REACTIONS             */
  /* ========================= */

  async function loadReactions(messageId, container) {
    const { data, error } = await db
      .from("reactions")
      .select("emoji, user_id")
      .eq("message_id", messageId)

    if (error || !data) return

    const old = container.querySelector(".reaction-box")
    if (old) old.remove()

    const counts = {}
    let myReactionEmoji = null

    data.forEach(r => {
      counts[r.emoji] = (counts[r.emoji] || 0) + 1
      if (r.user_id === userId) myReactionEmoji = r.emoji
    })

    if (Object.keys(counts).length === 0) return

    const reactionDiv = document.createElement("div")
    reactionDiv.className = "reaction-box"
    reactionDiv.style = "display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;"

    Object.entries(counts).forEach(([emoji, count]) => {
      const isMine = emoji === myReactionEmoji
      const span = document.createElement("span")
      // Highlight the current user's chosen reaction in blue
      span.style = `background:${isMine ? "#3b82f6" : "#1e293b"};border:1px solid ${isMine ? "#60a5fa" : "transparent"};padding:2px 8px;border-radius:20px;font-size:13px;cursor:pointer;`
      span.innerText = `${emoji} ${count}`

      span.onclick = async () => {
        if (isMine) {
          // Tap own reaction to remove it
          await db.from("reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", userId)
          updateReactionUI({ message_id: messageId })
        } else {
          // Tap other reaction to switch to it
          showReactions(messageId)
        }
      }

      reactionDiv.appendChild(span)
    })

    container.appendChild(reactionDiv)
  }

  /* ========================= */
  /* EVENTS                     */
  /* ========================= */

  input.addEventListener("keydown", e => {
    if (e.key === "Enter") sendMessage()
  })

  sendBtn.addEventListener("click", sendMessage)

})
