import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Shell }            from '@/components/shell/Shell'
import { LandingScreen }   from '@/screens/LandingScreen'
import { HomeScreen }      from '@/screens/HomeScreen'
import { MonsterScreen }   from '@/screens/MonsterScreen'
import { EquipmentScreen } from '@/screens/EquipmentScreen'
import { FavoritesScreen } from '@/screens/FavoritesScreen'
import { SetBuilderScreen }from '@/screens/SetBuilderScreen'

const router = createBrowserRouter([
  { path: '/', element: <LandingScreen /> },
  {
    element: <Shell />,
    children: [
      { path: '/sandbox',      element: <HomeScreen /> },
      { path: '/monsters',     element: <MonsterScreen /> },
      { path: '/monsters/:id', element: <MonsterScreen /> },
      { path: '/equipment',    element: <EquipmentScreen /> },
      { path: '/favorites',    element: <FavoritesScreen /> },
      { path: '/builder',      element: <SetBuilderScreen /> },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
