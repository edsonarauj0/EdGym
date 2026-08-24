import {
  GoogleGenerativeAI,
  FunctionDeclaration,
  SchemaType,
  Content,
  GenerativeModel,
} from '@google/generative-ai'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'

const API_KEY = import.meta.env.VITE_GEMINI_API_KEY

let genAI: GoogleGenerativeAI | null = null

function getGenAI() {
  if (!genAI && API_KEY) {
    genAI = new GoogleGenerativeAI(API_KEY)
  }
  return genAI
}

// ─── Modelo primário e fallback quando a cota estoura ───────────────────────
// Ajuste os IDs abaixo caso o AI Studio mostre nomes diferentes para sua conta.
const MODEL_PRIMARY = 'gemini-3.6-flash'
const MODEL_FALLBACK = 'gemini-3.6-flash-lite'

function isTransientGeminiError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : err
  const msg = String(message ?? '').toLowerCase()
  return (
    msg.includes('429') ||
    msg.includes('500') ||
    msg.includes('502') ||
    msg.includes('503') ||
    msg.includes('504') ||
    msg.includes('quota') ||
    msg.includes('rate limit') ||
    msg.includes('high demand') ||
    msg.includes('temporarily unavailable')
  )
}

const wait = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds))

async function retryTransientGeminiRequest<T>(request: () => Promise<T>): Promise<T> {
  const retryDelays = [750, 1_500]

  for (let attempt = 0; ; attempt++) {
    try {
      return await request()
    } catch (err) {
      if (!isTransientGeminiError(err) || attempt === retryDelays.length) throw err

      await wait(retryDelays[attempt])
    }
  }
}

// ─── Análise de imagem de aparelho ──────────────────────────────────────────

export async function analyzeEquipmentImage(base64Image: string, mimeType = 'image/jpeg'): Promise<{
  equipmentName: string
  musclesWorked: string[]
  tips: string[]
  exercises: {
    name: string
    sets: number
    reps: string
    description: string
    restSeconds: number
    videoSearchQuery: string
  }[]
}> {
  const ai = getGenAI()
  if (!ai) throw new Error('Gemini API key não configurada')

  const parts = [
    {
      inlineData: {
        data: base64Image,
        mimeType,
      },
    },
    `Analise esta imagem de aparelho de academia e retorne APENAS um JSON válido (sem markdown, sem \`\`\`), com exatamente esta estrutura:
{
  "equipmentName": "nome do aparelho em português",
  "musclesWorked": ["músculo1", "músculo2"],
  "tips": ["dica de uso 1", "dica de segurança 2", "dica de postura 3"],
  "exercises": [
    {
      "name": "Nome do exercício",
      "sets": 3,
      "reps": "10-12",
      "description": "Como executar corretamente em uma frase",
      "restSeconds": 60,
      "videoSearchQuery": "nome exercício aparelho tutorial"
    }
  ]
}
Inclua de 3 a 5 exercícios. Responda somente com o JSON, sem nenhum texto antes ou depois.`,
  ]

  let result
  try {
    result = await retryTransientGeminiRequest(() =>
      ai.getGenerativeModel({ model: MODEL_PRIMARY }).generateContent(parts)
    )
  } catch (err) {
    if (!isTransientGeminiError(err)) throw err
    console.warn(`[Gemini] ${MODEL_PRIMARY} indisponível, tentando ${MODEL_FALLBACK}...`)
    result = await retryTransientGeminiRequest(() =>
      ai.getGenerativeModel({ model: MODEL_FALLBACK }).generateContent(parts)
    )
  }

  const text = result.response.text().trim()
  const json = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
  return JSON.parse(json)
}

export interface EdGymContext {
  equipmentList: string[]
  workoutGroups: string[]
  totalUsers: number
}

// ─── Function calling: ferramentas que a IA pode executar no sistema ───────

const createWorkoutGroupDeclaration: FunctionDeclaration = {
  name: 'createWorkoutGroup',
  description:
    'Cria um grupo de treino real no sistema da academia, com seus exercícios. Use esta função sempre que o usuário pedir para você criar, cadastrar ou montar grupos de treino — não apenas descreva em texto, chame a função para cada grupo.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      name: {
        type: SchemaType.STRING,
        description: 'Nome do grupo, ex: "Grupo A - Empurrar (Peito, Ombro, Tríceps)"',
      },
      focus: {
        type: SchemaType.STRING,
        description: 'Foco muscular do grupo, ex: "Peito, Ombros e Tríceps"',
      },
      durationMinutes: {
        type: SchemaType.NUMBER,
        description: 'Duração estimada do treino em minutos',
      },
      frequency: {
        type: SchemaType.STRING,
        description: 'Frequência semanal recomendada, ex: "1 a 2 vezes por semana"',
      },
      exercises: {
        type: SchemaType.ARRAY,
        description: 'Lista de exercícios do grupo',
        items: {
          type: SchemaType.OBJECT,
          properties: {
            name: { type: SchemaType.STRING, description: 'Nome do exercício' },
            sets: { type: SchemaType.NUMBER, description: 'Número de séries' },
            reps: { type: SchemaType.STRING, description: 'Faixa de repetições, ex: "8-10"' },
            equipment: { type: SchemaType.STRING, description: 'Aparelho utilizado' },
            videoSearchQuery: {
              type: SchemaType.STRING,
              description: 'Termo de busca no YouTube para um tutorial do exercício, ex: "supino reto com barra tutorial execução"',
            },
          },
          required: ['name', 'sets', 'reps', 'videoSearchQuery'],
        },
      },
    },
    required: ['name', 'focus', 'exercises'],
  },
}

const edGymTools = [{ functionDeclarations: [createWorkoutGroupDeclaration] }]

async function executeFunctionCall(call: { name: string; args: any }): Promise<any> {
  switch (call.name) {
    case 'createWorkoutGroup': {
      try {
        const docRef = await addDoc(collection(db, 'workoutGroups'), {
          name: call.args.name,
          focus: call.args.focus,
          durationMinutes: call.args.durationMinutes ?? null,
          frequency: call.args.frequency ?? null,
          exercises: call.args.exercises ?? [], // agora já vem com videoSearchQuery
          createdAt: serverTimestamp(),
        })
        return {
          success: true,
          id: docRef.id,
          message: `Grupo "${call.args.name}" criado com sucesso no sistema.`,
        }
      } catch (err: any) {
        console.error('[Gemini] Erro ao criar grupo de treino:', err)
        return { success: false, error: err.message }
      }
    }
    default:
      return { success: false, error: `Função desconhecida: ${call.name}` }
  }
}

function buildSystemPrompt(ctx: EdGymContext): string {
  return `Você é um personal trainer especialista com 15 anos de experiência em musculação, funcional e periodização de treinos.

Você está auxiliando o ADMINISTRADOR da academia EdGym a planejar e organizar os treinos dos alunos.

CONTEXTO ATUAL DA ACADEMIA:
- Aparelhos disponíveis: ${ctx.equipmentList.length > 0 ? ctx.equipmentList.join(', ') : 'Nenhum cadastrado ainda'}
- Grupos de treino existentes: ${ctx.workoutGroups.length > 0 ? ctx.workoutGroups.join(', ') : 'Nenhum cadastrado ainda'}
- Alunos ativos: ${ctx.totalUsers}

SUAS RESPONSABILIDADES:
1. Sugerir grupos de treino (A, B, C, etc.) baseados nos aparelhos disponíveis
2. Recomendar exercícios específicos com séries e repetições
3. Propor frequência semanal adequada ao objetivo do aluno
4. Explicar a lógica por trás de cada sugestão
5. Adaptar sugestões aos aparelhos que a academia possui

IMPORTANTE — AÇÕES NO SISTEMA:
Quando o usuário pedir para você CRIAR, CADASTRAR ou MONTAR grupos de treino (não apenas sugerir em texto), você DEVE chamar a função createWorkoutGroup para cada grupo, uma chamada por grupo. Depois que as funções forem executadas, confirme ao usuário o que foi criado.
Se o usuário pedir apenas sugestões, opiniões ou explicações, responda normalmente em texto sem chamar funções.

FORMATO DE RESPOSTAS (quando não usar funções):
- Use linguagem clara e objetiva em português brasileiro
- Use **negrito** para destacar informações importantes
- Use listas com bullet points para exercícios

Seja específico, prático e baseie suas recomendações em evidências científicas.`
}

// ─── Sessão de chat própria (bypassa o role "function" do ChatSession padrão) ──

export interface EdGymChatSession {
  model: GenerativeModel
  contents: Content[]
  ctx: EdGymContext
  modelName: string
}

function buildModel(ctx: EdGymContext, modelName: string): GenerativeModel {
  const ai = getGenAI()
  if (!ai) throw new Error('Gemini API key não configurada')

  return ai.getGenerativeModel({
    model: modelName,
    systemInstruction: buildSystemPrompt(ctx),
    tools: edGymTools,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 2048,
    },
  })
}

export function createEdGymChatSession(ctx: EdGymContext): EdGymChatSession | null {
  const ai = getGenAI()
  if (!ai) {
    console.error('[Gemini] API key não configurada')
    return null
  }

  return {
    model: buildModel(ctx, MODEL_PRIMARY),
    contents: [],
    ctx,
    modelName: MODEL_PRIMARY,
  }
}

async function generateWithFallback(session: EdGymChatSession) {
  try {
    return await retryTransientGeminiRequest(() =>
      session.model.generateContent({ contents: session.contents })
    )
  } catch (err) {
    if (!isTransientGeminiError(err) || session.modelName === MODEL_FALLBACK) throw err

    console.warn(`[Gemini] ${session.modelName} indisponível, trocando para ${MODEL_FALLBACK}...`)
    session.modelName = MODEL_FALLBACK
    session.model = buildModel(session.ctx, MODEL_FALLBACK)
    return retryTransientGeminiRequest(() =>
      session.model.generateContent({ contents: session.contents })
    )
  }
}

export async function sendMessage(
  session: EdGymChatSession,
  message: string
): Promise<string> {
  session.contents.push({ role: 'user', parts: [{ text: message }] })

  let result = await generateWithFallback(session)
  let modelParts = result.response.candidates?.[0]?.content.parts ?? []
  session.contents.push({ role: 'model', parts: modelParts })

  let calls = result.response.functionCalls()
  let safety = 0

  while (calls && calls.length > 0 && safety < 6) {
    safety++

    const responseParts = await Promise.all(
      calls.map(async (call) => ({
        functionResponse: {
          name: call.name,
          response: await executeFunctionCall(call),
        },
      }))
    )

    // Role 'user' em vez de 'function' — é o que essa API aceita
    session.contents.push({ role: 'user', parts: responseParts })

    result = await generateWithFallback(session)
    modelParts = result.response.candidates?.[0]?.content.parts ?? []
    session.contents.push({ role: 'model', parts: modelParts })

    calls = result.response.functionCalls()
  }

  return result.response.text()
}
