import axios from 'axios'
import { getAWSConfig, getAuthHeaders } from '../config/aws.js'

const getClient = () => {
  const config = getAWSConfig()
  const baseURL = config.apiGatewayUrl || '/api'
  
  return axios.create({
    baseURL,
    timeout: 120000, // 2 min for AI generation
    headers: getAuthHeaders(),
  })
}

// ─── Ingestion APIs ──────────────────────────────────────────

export const ingestURL = async (url) => {
  const client = getClient()
  const response = await client.post('/ingest/url', { url })
  return response.data
}

export const ingestPDF = async (s3Key) => {
  const client = getClient()
  const response = await client.post('/ingest/pdf', { s3_key: s3Key })
  return response.data
}

export const ingestYoutube = async (videoUrl) => {
  const client = getClient()
  const response = await client.post('/ingest/youtube', { url: videoUrl })
  return response.data
}

// ─── Analysis API ────────────────────────────────────────────

export const analyzeContent = async (extractedText, options = {}) => {
  const client = getClient()
  const response = await client.post('/analyze', {
    text: extractedText,
    target_audience: options.targetAudience || 'general',
    tone: options.tone || 'balanced',
  })
  return response.data
}

// ─── Upload to S3 ────────────────────────────────────────────

export const getS3UploadUrl = async (filename, contentType) => {
  const client = getClient()
  const response = await client.post('/upload/presign', {
    filename,
    content_type: contentType,
  })
  return response.data // { upload_url, s3_key }
}

export const uploadFileToS3 = async (file, onProgress) => {
  const { upload_url, s3_key } = await getS3UploadUrl(file.name, file.type)
  
  await axios.put(upload_url, file, {
    headers: { 'Content-Type': file.type },
    onUploadProgress: (evt) => {
      if (onProgress) onProgress(Math.round((evt.loaded * 100) / evt.total))
    }
  })
  
  return s3_key
}

// ─── Transform / Generation APIs ─────────────────────────────

export const generateComic = async (payload) => {
  const client = getClient()
  const response = await client.post('/transform/comic', {
    script: payload.script,
    orientation: payload.orientation || 'square',
    art_style: payload.artStyle || 'anime',
    brand_tone: payload.brandTone || 5,
    character_description: payload.characterDescription || '',
    frames: payload.frames || 10,
  })
  return response.data // { frames: [{ image_url, caption, panel_number }] }
}

export const generateMeme = async (payload) => {
  const client = getClient()
  const response = await client.post('/transform/meme', {
    content_analysis: payload.contentAnalysis,
    platform: payload.platform || 'twitter',
    tone: payload.tone || 'humorous',
    brand_persona: payload.brandPersona || 'GenZ',
    count: payload.count || 3,
  })
  return response.data // { memes: [{ image_url, top_text, bottom_text }] }
}

export const generateInfographic = async (payload) => {
  const client = getClient()
  const response = await client.post('/transform/infographic', {
    data_points: payload.dataPoints,
    key_themes: payload.keyThemes,
    sentiment: payload.sentiment || 'professional',
    word_limit: payload.wordLimit || 200,
    dimensions: payload.dimensions || '1080x1080',
    platform: payload.platform || 'linkedin',
  })
  return response.data // { image_url, data }
}

// ─── Schedule / Distribution ──────────────────────────────────

export const getScheduleSuggestions = async (assets) => {
  const client = getClient()
  const response = await client.post('/schedule/suggest', { assets })
  return response.data // { schedule: [{ date, time, platform, asset_id, reason }] }
}

export const schedulePost = async (scheduleItem) => {
  const client = getClient()
  const response = await client.post('/schedule/create', scheduleItem)
  return response.data
}

export const getSchedule = async () => {
  const client = getClient()
  const response = await client.get('/schedule')
  return response.data
}

export const postToTwitter = async (content, imageUrl) => {
  const client = getClient()
  const response = await client.post('/distribute/twitter', {
    text: content,
    image_url: imageUrl,
  })
  return response.data
}

// ─── Health Check ─────────────────────────────────────────────

export const healthCheck = async () => {
  const client = getClient()
  try {
    const response = await client.get('/health')
    return { ok: true, data: response.data }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

// ─── Dynamic mock generators for demo/offline mode ────────────────
// These produce context-aware output based on the user's actual input
// instead of returning hardcoded generic data.

/**
 * Extract a readable title/topic from a URL or raw text.
 */
function _extractTopicFromInput(source = '', rawText = '') {
  // Strip file names like "Instruction.pdf" -> use rawText instead
  const isFilename = /^[^/\\]+\.(pdf|docx?|txt|pptx?)$/i.test(source)
  if (!isFilename && source.startsWith('http')) {
    try {
      const url = new URL(source)
      const segments = url.pathname.split('/').filter(Boolean)
      const last = segments[segments.length - 1] || url.hostname
      const slug = last.replace(/\.(html?|php|aspx?|pdf)$/i, '').replace(/[-_]/g, ' ')
      if (slug.length > 3 && !/^[0-9]+$/.test(slug)) return slug
      return url.hostname.replace(/^www\./i, '').split('.')[0]
    } catch {}
  }
  // Extract topic from raw text content (works for PDFs and plain text)
  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','was','are','were','be','this','that','it','its','from','by','as','we','our','your','their','have','has','had','will','can','may','about','which','when','who','how','what'])
  const words = rawText.trim().split(/\s+/).slice(0, 100)
  const significant = words.filter(w => w.length > 4 && !stopWords.has(w.toLowerCase()) && /^[A-Za-z]/.test(w))
  const freqMap = {}
  significant.forEach(w => { const k = w.toLowerCase(); freqMap[k] = (freqMap[k] || 0) + 1 })
  const top = Object.entries(freqMap).sort(([,a],[,b]) => b - a).slice(0, 2).map(([w]) => w)
  return top.join(' ') || 'content insights'
}

/**
 * Generate context-aware analysis from the user's actual input.
 */
export function generateMockAnalysis(source = '', rawText = '', audience = [], tone = []) {
  const topic = _extractTopicFromInput(source, rawText)
  const topicTitle = topic.charAt(0).toUpperCase() + topic.slice(1)

  // Extract simple word frequencies from raw text to derive pseudo-themes
  const stopWords = new Set(['the','a','an','and','or','but','in','on','at','to','for','of','with','is','was','are','were','be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','this','that','these','those','it','its'])
  const wordFreqs = {}
  rawText.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).forEach(w => {
    if (w.length > 4 && !stopWords.has(w)) wordFreqs[w] = (wordFreqs[w] || 0) + 1
  })
  const topWords = Object.entries(wordFreqs).sort(([,a],[,b]) => b - a).slice(0, 12).map(([w]) => w)

  // Build themes from top words or fallback to topic-based ones
  const themes = topWords.length >= 4
    ? topWords.slice(0, 4).map(w => w.charAt(0).toUpperCase() + w.slice(1))
    : [`${topicTitle} Overview`, `Key Insights`, `Impact & Trends`, `Future Outlook`]

  const sentences = rawText.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 40)
  const quotables = sentences.length >= 3
    ? sentences.slice(0, 3).map(s => s.slice(0, 120) + (s.length > 120 ? '...' : ''))
    : [
        `Understanding ${topicTitle} is essential for staying ahead in today's landscape.`,
        `The core principles of ${topicTitle} have far-reaching implications.`,
        `Experts agree: ${topicTitle} is reshaping the way we think about the future.`,
      ]

  // Attempt to find number-like statistics in the raw text
  const stats = []
  const numRegex = /(\d[\d,]*\.?\d*)\s*(%|percent|x|times|million|billion|k\b)/gi
  let match
  while ((match = numRegex.exec(rawText)) !== null && stats.length < 3) {
    const context = rawText.slice(Math.max(0, match.index - 30), match.index + 20).trim()
    stats.push({ label: context.slice(0, 25), value: match[1] + match[2] })
  }
  if (stats.length === 0) {
    stats.push(
      { label: `${topicTitle} Growth`, value: '3x' },
      { label: 'Audience Reach', value: '1M+' },
      { label: 'Engagement Rate', value: '12%' },
    )
  }

  const summary = sentences.length > 0
    ? sentences.slice(0, 2).join('. ') + '.'
    : `This content covers the key aspects of ${topicTitle}, exploring its impact, trends, and future implications for ${audience.join(', ') || 'a broad audience'}.`

  const isHumorous = tone.includes('Humorous') || tone.includes('Sarcastic') || tone.includes('Casual')
  const humor_score = isHumorous ? 0.72 : 0.28

  return {
    key_themes: themes,
    quotable_moments: quotables,
    statistics: stats.slice(0, 3),
    sentiment: 0.68,
    humor_score,
    summary,
    core_conflict: `The challenge of understanding and applying ${topicTitle} in a rapidly changing world.`,
    target_emotion: isHumorous ? 'amusement' : 'curiosity',
    meme_potential: `The ironic gap between what people expect from ${topicTitle} and what it actually delivers.`,
    comic_storyline: `Setup: A character encounters ${topicTitle} for the first time. Conflict: They struggle to grasp its implications. Resolution: They discover a key insight that changes their perspective.`,
  }
}

/**
 * Generate comic frames that reference the actual analysis themes.
 */
export function generateMockComicFrames(analysis, count = 4) {
  const themes = analysis?.key_themes || ['the topic', 'key ideas', 'insights', 'the conclusion']
  const storyline = analysis?.comic_storyline || ''
  const quotes = analysis?.quotable_moments || []

  const frameTemplates = [
    { caption: `Our hero discovers ${themes[0] || 'something incredible'}...`, dialogue: quotes[0]?.slice(0, 80) || 'Wait — this changes everything!' },
    { caption: `The challenge of ${themes[1] || 'understanding'} becomes clear`, dialogue: 'How do we even begin to tackle this?' },
    { caption: `Diving deep into ${themes[2] || 'the details'}`, dialogue: quotes[1]?.slice(0, 80) || 'The data doesn\'t lie.' },
    { caption: `A breakthrough moment with ${themes[3] || 'the final insight'}`, dialogue: null },
    { caption: `Applying ${themes[0] || 'the lesson'} in the real world`, dialogue: 'This is actually simpler than I thought!' },
    { caption: `The community rallies around ${themes[1] || 'the idea'}`, dialogue: 'Together we can make this work.' },
    { caption: `Obstacles arise — but ${themes[2] || 'perseverance'} wins`, dialogue: quotes[2]?.slice(0, 80) || 'Never give up.' },
    { caption: `The transformation is complete`, dialogue: '✨ Mission accomplished!' },
    { caption: `Sharing the knowledge with others`, dialogue: 'You need to hear this.' },
    { caption: `The journey continues...`, dialogue: null },
    { caption: `New horizons with ${themes[0] || 'fresh ideas'}`, dialogue: 'What comes next?' },
    { caption: `The final revelation`, dialogue: 'This was the key all along.' },
  ]

  // Use a hash of the theme name to get consistent but topic-varied picsum images
  const themeHash = (themes[0] || 'topic').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  // Panel mood offsets give visually distinct images per panel
  const moodOffsets = [10, 47, 83, 120, 156, 200, 234, 278, 310, 345, 380, 420]

  return Array.from({ length: Math.min(count, 12) }, (_, i) => {
    const tpl = frameTemplates[i % frameTemplates.length]
    const seed = themeHash + moodOffsets[i % moodOffsets.length]
    return {
      panel_number: i + 1,
      image_url: `https://picsum.photos/id/${(seed % 900) + 10}/300/300`,
      caption: tpl.caption,
      dialogue: tpl.dialogue,
    }
  })
}

/**
 * Generate memes based on the actual analysis content.
 */
export function generateMockMemes(analysis, count = 3) {
  const themes = analysis?.key_themes || ['the topic']
  const quotes = analysis?.quotable_moments || []
  const meme_potential = analysis?.meme_potential || `the irony of ${themes[0]}`
  const core_conflict = analysis?.core_conflict || `understanding ${themes[0]}`

  const templates = [
    {
      top_text: `EVERYONE TALKING ABOUT ${(themes[0] || 'IT').toUpperCase()}`,
      bottom_text: `ME ACTUALLY UNDERSTANDING IT`,
    },
    {
      top_text: `BEFORE READING ABOUT ${(themes[1] || themes[0] || 'THIS').toUpperCase()}`,
      bottom_text: `AFTER READING ABOUT IT`,
    },
    {
      top_text: quotes[0] ? `"${quotes[0].slice(0, 50).toUpperCase()}"` : `THE STRUGGLE WITH ${(themes[0] || 'IT').toUpperCase()} IS REAL`,
      bottom_text: `— EVERYONE IN THIS FIELD`,
    },
    {
      top_text: `WHEN SOMEONE SAYS ${(themes[2] || themes[0] || 'THIS').toUpperCase()} IS EASY`,
      bottom_text: `HAVE YOU MET ${(themes[1] || 'REALITY').toUpperCase()}??`,
    },
    {
      top_text: `${(themes[0] || 'IT').toUpperCase()} EXPERTS BE LIKE`,
      bottom_text: quotes[1] ? `"${quotes[1].slice(0, 50).toUpperCase()}"` : `"IT'S ACTUALLY QUITE SIMPLE"`,
    },
  ]

  const memeHash = (themes[0] || 'topic').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const memeOffsets = [500, 550, 600, 650, 700]

  return Array.from({ length: Math.min(count, 5) }, (_, i) => {
    const tpl = templates[i % templates.length]
    const seed = (memeHash + memeOffsets[i % memeOffsets.length]) % 900 + 10
    return {
      id: i + 1,
      image_url: `https://picsum.photos/id/${seed}/400/400`,
      top_text: tpl.top_text,
      bottom_text: tpl.bottom_text,
    }
  })
}

/**
 * Generate an infographic/LinkedIn post from the actual analysis.
 */
export function generateMockInfographic(analysis) {
  const themes = analysis?.key_themes || ['Key Topic']
  const quotes = analysis?.quotable_moments || []
  const stats = analysis?.statistics || []
  const summary = analysis?.summary || ''
  const topicTitle = themes[0] || 'Key Insights'

  const hook = `🔑 ${quotes[0]?.slice(0, 100) || `Everything you need to know about ${topicTitle}`}`
  const title = `${topicTitle}: Key Insights & Takeaways`

  const bullets = themes.map((t, i) => {
    const stat = stats[i]
    return stat
      ? `• **${t}** — ${stat.value} ${stat.label}`
      : `• **${t}** — A critical factor worth exploring`
  }).join('\n')

  const body = `${summary ? summary + '\n\n' : ''}${bullets}`

  const hashtags = themes.map(t => `#${t.replace(/\s+/g, '')}`)
  hashtags.push('#ContentMarketing', '#Insights', '#AI')

  return {
    image_url: `https://picsum.photos/seed/info${(themes[0] || 'x').slice(0, 4)}/1080/1080`,
    content: {
      hook,
      title,
      body,
      cta: `💬 What's your take? Drop your thoughts below!`,
      hashtags: hashtags.slice(0, 6),
    },
    data: { title: topicTitle, sections: themes.length }
  }
}

/**
 * Generate a schedule based on which assets were actually created.
 */
export function generateMockSchedule(generatedAssets = {}) {
  const baseTime = Date.now()
  const schedule = []
  let id = 1

  if (generatedAssets.infographic) {
    schedule.push({ id: id++, date: new Date(baseTime + 86400000).toISOString(), time: '09:00', platform: 'linkedin', type: 'infographic', reason: 'Monday morning — professional audiences peak on LinkedIn 9–11am' })
  }
  if (generatedAssets.comicFrames?.length > 0) {
    schedule.push({ id: id++, date: new Date(baseTime + 86400000 * 2).toISOString(), time: '11:00', platform: 'twitter', type: 'comic', reason: 'Tuesday carousel — visual content drives 3x more engagement mid-morning' })
    schedule.push({ id: id++, date: new Date(baseTime + 86400000 * 3).toISOString(), time: '18:00', platform: 'instagram', type: 'comic', reason: 'Wednesday evening — Instagram carousel gets peak reach after 6pm' })
  }
  if (generatedAssets.memes?.length > 0) {
    schedule.push({ id: id++, date: new Date(baseTime + 86400000 * 4).toISOString(), time: '15:00', platform: 'twitter', type: 'meme', reason: 'Thursday afternoon — memes peak 3–5pm on Twitter/X' })
    schedule.push({ id: id++, date: new Date(baseTime + 86400000 * 6).toISOString(), time: '10:00', platform: 'instagram', type: 'meme', reason: 'Saturday morning — casual scroll time, memes outperform all content types' })
  }

  // Fallback if nothing generated
  if (schedule.length === 0) {
    schedule.push({ id: 1, date: new Date(baseTime + 86400000).toISOString(), time: '09:00', platform: 'linkedin', type: 'infographic', reason: 'Default optimal posting time' })
  }

  return schedule
}
