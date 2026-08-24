import { Timestamp } from 'firebase/firestore'

export type UserRole = 'admin' | 'user'

export interface AppUser {
  uid: string
  name: string
  email: string
  role: UserRole
  assignedGroupIds: string[]
  currentGroupIndex: number
  createdAt: Timestamp
}

export interface Equipment {
  id: string
  name: string
  imageUrl: string
  musclesWorked: string[]
  aiSuggestions: string // raw AI tip text
  createdAt: Timestamp
}

export interface Exercise {
  id: string
  name: string
  equipmentId: string
  equipmentName: string
  description: string
  sets: string
  reps: string
  restSeconds: number
  videoSearchQuery: string
  imageUrl?: string
  orderIndex: number
}

export interface WorkoutGroup {
  id: string
  name: string        // e.g., "Grupo A - Superiores Frente"
  description: string
  muscleTarget: string // e.g., "Peito, Ombro, Tríceps"
  exercises: Exercise[]
  assignedUserIds: string[]
  colorHex: string    // visual identifier
  createdAt: Timestamp
}

export interface WorkoutSession {
  id: string
  userId: string
  date: Timestamp
  groupId: string
  groupName: string
  durationMinutes: number
  bodyWeightKg: number
  notes: string
  completedExerciseIds: string[]
  exerciseWeights?: Record<string, number>
  createdAt: Timestamp
}

// For calendar display
export interface SessionSummary {
  date: string        // 'YYYY-MM-DD'
  groupName: string
  durationMinutes: number
  bodyWeightKg: number
}
