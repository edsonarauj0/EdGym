import { useEffect, useRef, useState } from 'react'
import { collection, addDoc, getDocs, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { Equipment, Exercise } from '@/types'
import { analyzeEquipmentImage } from '@/lib/gemini'
import { uploadToCloudinary, fileToBase64 } from '@/lib/cloudinary'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  Sparkles,
  Trash2,
  Loader2,
  Monitor,
  ExternalLink,
  AlertCircle,
  ImageIcon,
  Lightbulb,
  Clock,
} from 'lucide-react'
import { getYouTubeSearchUrl } from '@/lib/utils'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

export function EquipmentPage() {
  const [equipment, setEquipment] = useState<Equipment[]>([])
  const [exercisesByEquipment, setExercisesByEquipment] = useState<Record<string, Exercise[]>>({})
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [aiResult, setAiResult] = useState<Awaited<ReturnType<typeof analyzeEquipmentImage>> | null>(null)
  const [detailsEquipment, setDetailsEquipment] = useState<Equipment | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadEquipment = async () => {
    setLoading(true)
    try {
      const [equipSnap, exercisesSnap] = await Promise.all([
        getDocs(collection(db, 'equipment')),
        getDocs(collection(db, 'exercises')),
      ])

      setEquipment(equipSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Equipment)))

      const grouped: Record<string, Exercise[]> = {}
      exercisesSnap.docs.forEach((d) => {
        const ex = { id: d.id, ...d.data() } as Exercise
        if (!grouped[ex.equipmentId]) grouped[ex.equipmentId] = []
        grouped[ex.equipmentId].push(ex)
      })
      Object.values(grouped).forEach((list) => list.sort((a, b) => a.orderIndex - b.orderIndex))
      setExercisesByEquipment(grouped)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadEquipment() }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSelectedFile(file)
    setAiResult(null)
    const url = URL.createObjectURL(file)
    setPreview(url)
  }

  const handleAnalyze = async () => {
    if (!selectedFile) return
    setAnalyzing(true)
    try {
      const { base64, mimeType } = await fileToBase64(selectedFile)
      const result = await analyzeEquipmentImage(base64, mimeType)
      setAiResult(result)
      toast.success('IA analisou o aparelho com sucesso!')
    } catch (err) {
      toast.error('A IA está temporariamente indisponível. Tente novamente em alguns instantes.')
      console.error(err)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSave = async () => {
    if (!selectedFile || !aiResult) return
    setUploading(true)
    try {
      const imageUrl = await uploadToCloudinary(selectedFile)

      const equipRef = await addDoc(collection(db, 'equipment'), {
        name: aiResult.equipmentName,
        imageUrl,
        musclesWorked: aiResult.musclesWorked,
        aiSuggestions: aiResult.tips.join(' '),
        createdAt: serverTimestamp(),
      })

      await Promise.all(
        aiResult.exercises.map((ex, index) =>
          addDoc(collection(db, 'exercises'), {
            name: ex.name,
            equipmentId: equipRef.id,
            equipmentName: aiResult.equipmentName,
            description: ex.description,
            sets: String(ex.sets),
            reps: ex.reps,
            restSeconds: ex.restSeconds,
            videoSearchQuery: ex.videoSearchQuery,
            orderIndex: index,
          })
        )
      )

      toast.success(`Aparelho "${aiResult.equipmentName}" salvo com sucesso!`)
      setPreview(null)
      setSelectedFile(null)
      setAiResult(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      await loadEquipment()
    } catch (err) {
      toast.error('Erro ao salvar o aparelho. Verifique as configurações do Cloudinary.')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation()
    if (!confirm(`Remover "${name}"?`)) return

    // Remove o aparelho e seus exercícios associados
    const relatedExercises = exercisesByEquipment[id] ?? []
    await Promise.all([
      deleteDoc(doc(db, 'equipment', id)),
      ...relatedExercises.map((ex) => deleteDoc(doc(db, 'exercises', ex.id))),
    ])

    toast.success('Aparelho removido.')
    await loadEquipment()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Monitor className="w-6 h-6 text-primary" />
          Aparelhos da Academia
        </h1>
        <p className="text-muted-foreground mt-1">
          Tire uma foto de um aparelho e a IA vai identificar e sugerir os treinos automaticamente
        </p>
      </div>

      {/* Upload Section */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            Adicionar novo aparelho com IA
          </CardTitle>
          <CardDescription>
            Faça upload de uma foto e o Gemini AI vai identificar o aparelho e criar os exercícios
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Upload area */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all text-center group"
          >
            {preview ? (
              <img
                src={preview}
                alt="Preview"
                className="max-h-48 mx-auto rounded-lg object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground group-hover:text-foreground transition-colors">
                <ImageIcon className="w-12 h-12" />
                <div>
                  <p className="font-medium">Clique para selecionar uma foto</p>
                  <p className="text-sm">JPG, PNG, WEBP até 10MB</p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {/* AI Analysis result */}
          {aiResult && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-primary">
                  {aiResult.equipmentName}
                </h3>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Músculos trabalhados</p>
                <div className="flex flex-wrap gap-2">
                  {aiResult.musclesWorked.map((m) => (
                    <Badge key={m}>{m}</Badge>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Exercícios sugeridos</p>
                {aiResult.exercises.map((ex, i) => (
                  <div key={i} className="bg-card rounded-lg p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{ex.name}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{ex.sets}x{ex.reps}</Badge>
                        <a
                          href={getYouTubeSearchUrl(ex.videoSearchQuery)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:text-primary/80 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">{ex.description}</p>
                    <p className="text-xs text-muted-foreground/60">Descanso: {ex.restSeconds}s</p>
                  </div>
                ))}
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-yellow-300">{aiResult.tips.join(' ')}</p>
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            {selectedFile && !aiResult && (
              <Button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="flex-1"
              >
                {analyzing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Analisando com IA...</>
                ) : (
                  <><Sparkles className="w-4 h-4" /> Analisar com Gemini AI</>
                )}
              </Button>
            )}
            {aiResult && (
              <Button
                onClick={handleSave}
                disabled={uploading}
                className="flex-1"
              >
                {uploading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : (
                  <><Upload className="w-4 h-4" /> Salvar Aparelho</>
                )}
              </Button>
            )}
            {(preview || aiResult) && (
              <Button
                variant="outline"
                onClick={() => {
                  setPreview(null)
                  setSelectedFile(null)
                  setAiResult(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
              >
                Cancelar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Equipment list */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Aparelhos cadastrados ({equipment.length})</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : equipment.length === 0 ? (
          <Card className="border-dashed border-border/50">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Monitor className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum aparelho cadastrado ainda.</p>
              <p className="text-sm">Faça upload de uma foto acima para começar.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {equipment.map((eq) => {
              const exCount = exercisesByEquipment[eq.id]?.length ?? 0
              return (
                <Card
                  key={eq.id}
                  onClick={() => setDetailsEquipment(eq)}
                  className="border-border/50 overflow-hidden group hover:border-primary/30 transition-colors cursor-pointer"
                >
                  {eq.imageUrl && (
                    <div className="relative h-48 overflow-hidden">
                      <img
                        src={eq.imageUrl}
                        alt={eq.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-card via-transparent to-transparent" />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold">{eq.name}</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-400/10"
                        onClick={(e) => handleDelete(e, eq.id, eq.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {eq.musclesWorked?.slice(0, 3).map((m) => (
                        <Badge key={m}className="text-xs">{m}</Badge>
                      ))}
                      {(eq.musclesWorked?.length || 0) > 3 && (
                        <Badge variant="outline" className="text-xs">+{eq.musclesWorked.length - 3}</Badge>
                      )}
                    </div>
                    {exCount > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {exCount} exercício{exCount > 1 ? 's' : ''} cadastrado{exCount > 1 ? 's' : ''} · toque para ver
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Details modal */}
      <Dialog open={!!detailsEquipment} onOpenChange={(open) => !open && setDetailsEquipment(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailsEquipment && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-primary" />
                  {detailsEquipment.name}
                </DialogTitle>
                <DialogDescription>
                  Exercícios, observações e vídeos sugeridos pela IA
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {detailsEquipment.imageUrl && (
                  <img
                    src={detailsEquipment.imageUrl}
                    alt={detailsEquipment.name}
                    className="w-full h-40 object-cover rounded-lg"
                  />
                )}

                <div>
                  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wide">Músculos trabalhados</p>
                  <div className="flex flex-wrap gap-2">
                    {detailsEquipment.musclesWorked?.map((m) => (
                      <Badge key={m} className="text-xs">{m}</Badge>
                    ))}
                  </div>
                </div>

                {detailsEquipment.aiSuggestions && (
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 space-y-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Lightbulb className="w-4 h-4 text-yellow-400" />
                      <p className="text-xs font-medium uppercase tracking-wide text-yellow-300">Observações da IA</p>
                    </div>
                    <p className="text-xs text-yellow-200/90">{detailsEquipment.aiSuggestions}</p>
                  </div>
                )}

                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                    Exercícios ({exercisesByEquipment[detailsEquipment.id]?.length ?? 0})
                  </p>
                  {(exercisesByEquipment[detailsEquipment.id]?.length ?? 0) === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum exercício cadastrado para este aparelho.</p>
                  )}
                  {exercisesByEquipment[detailsEquipment.id]?.map((ex) => (
                    <div key={ex.id} className="bg-secondary/40 rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm">{ex.name}</p>
                        <Badge variant="outline" className="shrink-0">{ex.sets}x{ex.reps}</Badge>
                      </div>
                      {ex.description && (
                        <p className="text-xs text-muted-foreground">{ex.description}</p>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        {ex.restSeconds != null && (
                          <span className="text-xs text-muted-foreground/70 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Descanso: {ex.restSeconds}s
                          </span>
                        )}
                        {ex.videoSearchQuery && (
                          <a
                            href={getYouTubeSearchUrl(ex.videoSearchQuery)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 transition-colors text-xs flex items-center gap-1 font-medium"
                          >
                            Ver vídeo <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
