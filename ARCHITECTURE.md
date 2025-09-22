# Attendance App Architecture

This document describes the refactored architecture of the face recognition attendance system.

## Architecture Overview

The application is now organized into clean, separated layers:

### 1. Service Layer (`/src/services/`)

- **`attendanceService.ts`** - Central business logic and state management
  - Handles all face recognition logic
  - Manages database operations (Supabase)
  - Provides reactive state updates using observer pattern
  - Singleton service instance for global state

### 2. UI Layer (`/src/components/`)

- **`AttendanceUI.tsx`** - Pure UI component
  - Only handles rendering and user interactions
  - No business logic or state management
  - Receives all data and callbacks as props
  - Fully testable and reusable

- **`AttendanceApp.tsx`** - Thin orchestration layer
  - Connects UI to service
  - Handles error notifications
  - Uses custom hook for service interaction

### 3. Hook Layer (`/src/hooks/`)

- **`useAttendanceService.ts`** - Custom hook for service integration
  - Provides reactive state updates from service
  - Exposes convenient action methods
  - Encapsulates service subscription logic

## Benefits of This Architecture

### ✅ Separation of Concerns

- **UI Components**: Only handle presentation and user interaction
- **Service Layer**: Manages business logic and data persistence
- **Hook Layer**: Provides clean React integration

### ✅ Maintainability

- Easy to modify business logic without touching UI
- UI changes don't affect business logic
- Clear boundaries between different concerns

### ✅ Testability

- Service can be tested independently of React
- UI components can be tested with mock props
- Business logic is isolated and pure

### ✅ Reusability

- Service can be used by multiple components
- UI components are pure and reusable
- Hook provides convenient React integration

### ✅ Type Safety

- Full TypeScript support throughout
- Shared interfaces and types
- Compile-time error checking

## File Structure

```plaintext
src/
├── components/
│   ├── AttendanceApp.tsx      # Main orchestration component
│   ├── AttendanceUI.tsx       # Pure UI component
│   ├── CameraView.tsx         # Camera interface
│   └── StudentManager.tsx     # Student management
├── services/
│   └── attendanceService.ts   # Business logic service
├── hooks/
│   └── useAttendanceService.ts # React integration hook
└── utils/
    └── faceRecognition.ts     # Face-api.js utilities
```

## Usage Examples

### Service Usage (Direct)

```typescript
import { attendanceService } from '../services/attendanceService';

// Subscribe to state changes
const unsubscribe = attendanceService.subscribe((state) => {
  console.log('State updated:', state);
});

// Perform actions
attendanceService.setSelectedClass('class-id');
const result = await attendanceService.startAttendance();
```

### Hook Usage (React)

```typescript
import { useAttendanceService } from '../hooks/useAttendanceService';

const MyComponent = () => {
  const { 
    classes, 
    selectedClass, 
    setSelectedClass,
    startAttendance 
  } = useAttendanceService();

  return (
    <select value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)}>
      {classes.map(cls => <option key={cls.id} value={cls.id}>{cls.class_name}</option>)}
    </select>
  );
};
```

## Migration Notes

The refactoring maintains full backward compatibility:

- All existing functionality preserved
- Same user interface and behavior
- Improved code organization and maintainability
- Better error handling and type safety

## Future Enhancements

With this architecture, future improvements become easier:

- Add offline support in service layer
- Implement caching strategies
- Add different UI themes or layouts
- Create mobile-specific components
- Add unit and integration tests
- Implement real-time updates via websockets
