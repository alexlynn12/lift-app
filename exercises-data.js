// Default exercise library. Each exercise: id, name, muscle, equipment.
const DEFAULT_EXERCISES = [
  // Chest
  { id: "barbell-bench-press", name: "Barbell bench press", muscle: "Chest", equipment: "Barbell" },
  { id: "incline-barbell-bench-press", name: "Incline barbell bench press", muscle: "Chest", equipment: "Barbell" },
  { id: "dumbbell-bench-press", name: "Dumbbell bench press", muscle: "Chest", equipment: "Dumbbell" },
  { id: "incline-dumbbell-press", name: "Incline dumbbell press", muscle: "Chest", equipment: "Dumbbell" },
  { id: "dumbbell-fly", name: "Dumbbell fly", muscle: "Chest", equipment: "Dumbbell" },
  { id: "cable-crossover", name: "Cable crossover", muscle: "Chest", equipment: "Cable" },
  { id: "push-up", name: "Push-up", muscle: "Chest", equipment: "Bodyweight" },
  { id: "chest-dip", name: "Chest dip", muscle: "Chest", equipment: "Bodyweight" },
  { id: "machine-chest-press", name: "Machine chest press", muscle: "Chest", equipment: "Machine" },

  // Back
  { id: "deadlift", name: "Deadlift", muscle: "Back", equipment: "Barbell" },
  { id: "pull-up", name: "Pull-up", muscle: "Back", equipment: "Bodyweight" },
  { id: "chin-up", name: "Chin-up", muscle: "Back", equipment: "Bodyweight" },
  { id: "lat-pulldown", name: "Lat pulldown", muscle: "Back", equipment: "Cable" },
  { id: "barbell-row", name: "Barbell row", muscle: "Back", equipment: "Barbell" },
  { id: "pendlay-row", name: "Pendlay row", muscle: "Back", equipment: "Barbell" },
  { id: "dumbbell-row", name: "Dumbbell row", muscle: "Back", equipment: "Dumbbell" },
  { id: "seated-cable-row", name: "Seated cable row", muscle: "Back", equipment: "Cable" },
  { id: "t-bar-row", name: "T-bar row", muscle: "Back", equipment: "Barbell" },
  { id: "face-pull", name: "Face pull", muscle: "Back", equipment: "Cable" },
  { id: "good-morning", name: "Good morning", muscle: "Back", equipment: "Barbell" },
  { id: "hyperextension", name: "Hyperextension", muscle: "Back", equipment: "Bodyweight" },

  // Shoulders
  { id: "overhead-press", name: "Overhead press", muscle: "Shoulders", equipment: "Barbell" },
  { id: "dumbbell-shoulder-press", name: "Dumbbell shoulder press", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "arnold-press", name: "Arnold press", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "lateral-raise", name: "Lateral raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "front-raise", name: "Front raise", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "rear-delt-fly", name: "Rear delt fly", muscle: "Shoulders", equipment: "Dumbbell" },
  { id: "cable-lateral-raise", name: "Cable lateral raise", muscle: "Shoulders", equipment: "Cable" },
  { id: "shrug", name: "Barbell shrug", muscle: "Shoulders", equipment: "Barbell" },

  // Arms - biceps
  { id: "barbell-curl", name: "Barbell curl", muscle: "Biceps", equipment: "Barbell" },
  { id: "dumbbell-curl", name: "Dumbbell curl", muscle: "Biceps", equipment: "Dumbbell" },
  { id: "hammer-curl", name: "Hammer curl", muscle: "Biceps", equipment: "Dumbbell" },
  { id: "preacher-curl", name: "Preacher curl", muscle: "Biceps", equipment: "Barbell" },
  { id: "cable-curl", name: "Cable curl", muscle: "Biceps", equipment: "Cable" },

  // Arms - triceps
  { id: "close-grip-bench-press", name: "Close-grip bench press", muscle: "Triceps", equipment: "Barbell" },
  { id: "triceps-pushdown", name: "Triceps pushdown", muscle: "Triceps", equipment: "Cable" },
  { id: "skull-crusher", name: "Skull crusher", muscle: "Triceps", equipment: "Barbell" },
  { id: "overhead-triceps-extension", name: "Overhead triceps extension", muscle: "Triceps", equipment: "Dumbbell" },
  { id: "triceps-dip", name: "Triceps dip", muscle: "Triceps", equipment: "Bodyweight" },

  // Legs
  { id: "squat", name: "Barbell squat", muscle: "Legs", equipment: "Barbell" },
  { id: "front-squat", name: "Front squat", muscle: "Legs", equipment: "Barbell" },
  { id: "leg-press", name: "Leg press", muscle: "Legs", equipment: "Machine" },
  { id: "romanian-deadlift", name: "Romanian deadlift", muscle: "Legs", equipment: "Barbell" },
  { id: "leg-extension", name: "Leg extension", muscle: "Legs", equipment: "Machine" },
  { id: "leg-curl", name: "Leg curl", muscle: "Legs", equipment: "Machine" },
  { id: "walking-lunge", name: "Walking lunge", muscle: "Legs", equipment: "Dumbbell" },
  { id: "bulgarian-split-squat", name: "Bulgarian split squat", muscle: "Legs", equipment: "Dumbbell" },
  { id: "hip-thrust", name: "Hip thrust", muscle: "Legs", equipment: "Barbell" },
  { id: "calf-raise", name: "Standing calf raise", muscle: "Legs", equipment: "Machine" },

  // Core
  { id: "plank", name: "Plank", muscle: "Core", equipment: "Bodyweight" },
  { id: "hanging-leg-raise", name: "Hanging leg raise", muscle: "Core", equipment: "Bodyweight" },
  { id: "cable-crunch", name: "Cable crunch", muscle: "Core", equipment: "Cable" },
  { id: "ab-wheel-rollout", name: "Ab wheel rollout", muscle: "Core", equipment: "Other" },
  { id: "russian-twist", name: "Russian twist", muscle: "Core", equipment: "Bodyweight" },
];
