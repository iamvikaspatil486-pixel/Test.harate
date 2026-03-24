document.addEventListener("DOMContentLoaded", () => {

  const input        = document.getElementById("msgInput")
  const sendBtn      = document.getElementById("sendBtn")
  const voiceBtn     = document.getElementById("voiceBtn")
  const messages     = document.querySelector(".messages")
  const fileInput    = document.querySelector('input[type="file"]')
  const gifBtn       = document.getElementById("gifBtn")
  const replyPreview = document.getElementById("replyPreview")

  if (!input || !sendBtn || !messages) {
    console.error("UI elements missing")
    return
  }

  const db = window.db

  // 🔑 Tenor GIF API key — get your free key at: https://developers.google.com/tenor/guides/quickstart
  const TENOR_API_KEY = "YOUR_TENOR_API_KEY_HERE"

  /* ========================= */
  /* USER                       */
  /* ========================= */

  let storedUser = null
  try { storedUser = JSON.parse(localStorage.getItem("anon_user")) } catch (e) {}

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
    if (document.querySelector(`[data-id="${msg.id}"]`)) return

    const div = document.createElement("div")
    div.className = "mb-3"
    div.setAttribute("data-id", msg.id)

    let replyHTML = msg.reply_to
      ? `<div style="font-size:11px;color:#94a3b8;border-left:2px solid #3b82f6;padding-left:6px;margin-bottom:4px;">↩ ${msg.reply_to}</div>`
      : ""

    let mediaHTML  = ""
    let audioHTML  = ""

    if (msg.media_url) {
      const url = msg.media_url
      const isAudio = url.includes(".webm") || url.includes(".ogg") || url.includes(".mp3")

      if (isAudio) {
        audioHTML = `
          <audio controls style="margin-top:6px;max-width:220px;width:100%;">
            <source src="${url}">
          </audio>`
      } else {
        // image or GIF — both render as <img>
        mediaHTML = `
          <img src="${url}"
            style="max-width:220px;border-radius:10px;margin-top:6px;display:block;cursor:pointer;"
            loading="lazy"
            onclick="window.open('${url}','_blank')"
          >`
      }
    }

    div.innerHTML = `
      <div style="font-size:11px;color:#9ca3af;margin-bottom:2px;">${msg.username}</div>
      ${replyHTML}
      <div style="background:#1e293b;color:white;padding:10px 14px;border-radius:14px;display:inline-block;max-width:85%;text-align:left;">
        ${msg.message ? `<span>${msg.message}</span>` : ""}
        ${mediaHTML}
        ${audioHTML}
      </div>
    `

    /* SWIPE → reply | LONG PRESS → reactions */
    let startX = 0

    div.addEventListener("touchstart", (e) => {
      startX = e.touches[0].clientX
      longPressTimer = setTimeout(() => showReactions(msg.id), 500)
    })

    div.addEventListener("touchmove", (e) => {
      const moveX = e.touches[0].clientX - startX
      if (moveX > 80) {
        clearTimeout(longPressTimer)
        showReplyPreview(msg.message || "📎 Media")
        div.style.transform = "translateX(20px)"
      }
    })

    div.addEventListener("touchend", () => {
      div.style.transform = "translateX(0)"
      clearTimeout(longPressTimer)
    })

    // Desktop: right-click to react
    div.addEventListener("contextmenu", (e) => {
      e.preventDefault()
      showReactions(msg.id)
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
  /* SEND TEXT MESSAGE          */
  /* ========================= */

  async function sendMessage() {
    const text = input.value.trim()
    if (text === "") return

    const tempId = "temp-" + Date.now()
    displayMessage({ id: tempId, user_id: userId, username, message: text, reply_to: replyTo })

    const { data, error } = await db.from("chat_messages").insert({
      user_id: userId, username, message: text, reply_to: replyTo
    }).select().single()

    if (!error && data) {
      const tempDiv = document.querySelector(`[data-id="${tempId}"]`)
      if (tempDiv) tempDiv.setAttribute("data-id", data.id)
    }

    clearReply()
    input.value = ""
  }

  /* ========================= */
  /* IMAGE UPLOAD               */
  /* ========================= */

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0]
    if (!file) return

    // Validate — images only
    if (!file.type.startsWith("image/")) {
      alert("Only image files are supported.")
      fileInput.value = ""
      return
    }

    // Show uploading placeholder
    const placeholderId = "upload-" + Date.now()
    const placeholder = document.createElement("div")
    placeholder.id = placeholderId
    placeholder.className = "mb-3"
    placeholder.innerHTML = `
      <div style="font-size:11px;color:#9ca3af;margin-bottom:2px;">${username}</div>
      <div style="background:#1e293b;color:#64748b;padding:10px 14px;border-radius:14px;display:inline-block;">
        📤 Uploading image...
      </div>
    `
    messages.appendChild(placeholder)
    messages.scrollTop = messages.scrollHeight

    const ext  = file.name.split(".").pop()
    const path = `${userId}/${Date.now()}.${ext}`

    const { error: uploadError } = await db.storage
      .from("chat-media")
      .upload(path, file, { contentType: file.type })

    placeholder.remove()

    if (uploadError) {
      console.error("Upload failed:", uploadError)
      alert("Image upload failed. Make sure the 'chat-media' bucket exists in Supabase Storage.")
      fileInput.value = ""
      return
    }

    const { data: urlData } = db.storage.from("chat-media").getPublicUrl(path)

    const { data, error } = await db.from("chat_messages").insert({
      user_id: userId,
      username,
      message: "",
      media_url: urlData.publicUrl,
      reply_to: replyTo
    }).select().single()

    if (!error && data) displayMessage(data)

    clearReply()
    fileInput.value = ""
  })

  /* ========================= */
  /* GIF PICKER (Tenor API)     */
  /* ========================= */

  gifBtn.addEventListener("click", () => {
    const existing = document.getElementById("gif-overlay")
    if (existing) { existing.remove(); return }
    openGifPicker()
  })

  function openGifPicker() {
    const overlay = document.createElement("div")
    overlay.id = "gif-overlay"
    overlay.style = `
      position:fixed;bottom:130px;left:0;right:0;
      background:#0f172a;border-top:1px solid #1e293b;
      z-index:999;padding:10px;
      display:flex;flex-direction:column;gap:8px;
      max-height:320px;
    `

    // Search bar row
    const searchRow = document.createElement("div")
    searchRow.style = "display:flex;gap:8px;align-items:center;"

    const searchInput = document.createElement("input")
    searchInput.placeholder = "🔍 Search GIFs..."
    searchInput.style = `
      flex:1;background:#1e293b;border:none;border-radius:20px;
      padding:8px 14px;color:white;outline:none;font-size:14px;
    `

    const closeBtn = document.createElement("button")
    closeBtn.innerText = "✕"
    closeBtn.style = "background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:0 4px;"
    closeBtn.onclick = () => overlay.remove()

    searchRow.appendChild(searchInput)
    searchRow.appendChild(closeBtn)

    // GIF grid
    const grid = document.createElement("div")
    grid.style = `
      display:grid;
      grid-template-columns:repeat(3,1fr);
      gap:5px;
      overflow-y:auto;
      max-height:250px;
    `

    overlay.appendChild(searchRow)
    overlay.appendChild(grid)
    document.body.appendChild(overlay)

    // Load trending on open
    fetchGifs("trending", grid)

    let debounce = null
    searchInput.addEventListener("input", () => {
      clearTimeout(debounce)
      debounce = setTimeout(() => {
        const q = searchInput.value.trim()
        fetchGifs(q || "trending", grid)
      }, 450)
    })

    searchInput.focus()
  }

  async function fetchGifs(query, grid) {
    grid.innerHTML = `<div style="color:#64748b;font-size:13px;padding:10px;grid-column:span 3;text-align:center;">Loading GIFs...</div>`

    const isTrending = query === "trending"
    const endpoint = isTrending
      ? `https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=18&media_filter=gif`
      : `https://tenor.googleapis.com/v2/search?q=${encodeURIComponent(query)}&key=${TENOR_API_KEY}&limit=18&media_filter=gif`

    try {
      const res  = await fetch(endpoint)
      const data = await res.json()

      grid.innerHTML = ""

      if (!data.results || data.results.length === 0) {
        grid.innerHTML = `<div style="color:#64748b;font-size:13px;padding:10px;grid-column:span 3;text-align:center;">No GIFs found.</div>`
        return
      }

      data.results.forEach(gif => {
        const gifUrl     = gif.media_formats?.gif?.url
        const previewUrl = gif.media_formats?.tinygif?.url || gifUrl
        if (!gifUrl) return

        const img = document.createElement("img")
        img.src   = previewUrl
        img.style = "width:100%;height:85px;object-fit:cover;border-radius:8px;cursor:pointer;transition:opacity 0.2s;"
        img.onmouseenter = () => img.style.opacity = "0.8"
        img.onmouseleave = () => img.style.opacity = "1"

        img.onclick = async () => {
          document.getElementById("gif-overlay")?.remove()
          await sendGif(gifUrl)
        }

        grid.appendChild(img)
      })

    } catch (err) {
      console.error("Tenor fetch error:", err)
      grid.innerHTML = `<div style="color:#ef4444;font-size:13px;padding:10px;grid-column:span 3;text-align:center;">Failed to load GIFs. Check your Tenor API key.</div>`
    }
  }

  async function sendGif(gifUrl) {
    const tempId = "temp-" + Date.now()
    displayMessage({ id: tempId, user_id: userId, username, message: "", media_url: gifUrl, reply_to: replyTo })

    const { data, error } = await db.from("chat_messages").insert({
      user_id: userId,
      username,
      message: "",
      media_url: gifUrl,
      reply_to: replyTo
    }).select().single()

    if (!error && data) {
      const tempDiv = document.querySelector(`[data-id="${tempId}"]`)
      if (tempDiv) tempDiv.setAttribute("data-id", data.id)
    }

    clearReply()
  }

  /* ========================= */
  /* VOICE RECORDING            */
  /* ========================= */

  let mediaRecorder = null
  let audioChunks   = []

  voiceBtn.addEventListener("click", async () => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop()
      voiceBtn.textContent = "🎤"
      voiceBtn.classList.remove("recording")
      return
    }

    try {
      const stream  = await navigator.mediaDevices.getUserMedia({ audio: true })
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
      voiceBtn.classList.add("recording")

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
        if (payload.new.user_id !== userId) displayMessage(payload.new)
      })
    .subscribe()

  /* ========================= */
  /* REALTIME REACTIONS         */
  /* ========================= */

  db.channel("reactions-live")
    .on("postgres_changes",
      { event: "*", schema: "public", table: "reactions" },
      (payload) => {
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

    const emojis = ["❤️", "😂", "🔥", "👍", "💯", "😮", "😢"]

    const overlay = document.createElement("div")
    overlay.id = "reaction-overlay"
    overlay.style = "position:fixed;top:0;left:0;width:100%;height:100%;z-index:998;"
    overlay.onclick = () => overlay.remove()

    const picker = document.createElement("div")
    picker.style = "position:fixed;bottom:140px;left:50%;transform:translateX(-50%);background:#1e293b;padding:10px 16px;border-radius:24px;display:flex;gap:10px;box-shadow:0 8px 30px rgba(0,0,0,0.6);"

    emojis.forEach(emoji => {
      const btn = document.createElement("span")
      btn.innerText = emoji
      btn.style.cssText = "font-size:26px;cursor:pointer;transition:transform 0.15s;"
      btn.onmouseenter = () => btn.style.transform = "scale(1.35)"
      btn.onmouseleave = () => btn.style.transform = "scale(1)"

      btn.onclick = async (e) => {
        e.stopPropagation()

        // Delete existing reaction (one per user per message)
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
      span.style = `
        background:${isMine ? "#3b82f6" : "#1e293b"};
        border:1px solid ${isMine ? "#60a5fa" : "#334155"};
        padding:2px 8px;border-radius:20px;font-size:13px;cursor:pointer;
      `
      span.innerText = `${emoji} ${count}`

      span.onclick = async () => {
        if (isMine) {
          await db.from("reactions")
            .delete()
            .eq("message_id", messageId)
            .eq("user_id", userId)
          updateReactionUI({ message_id: messageId })
        } else {
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
