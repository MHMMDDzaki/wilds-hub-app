import { useState, useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Shell }            from '@/components/shell/Shell'
import { LandingScreen }   from '@/screens/LandingScreen'
import { HomeScreen }      from '@/screens/HomeScreen'
import { MonsterScreen }   from '@/screens/MonsterScreen'
import { EquipmentScreen } from '@/screens/EquipmentScreen'
import { FavoritesScreen } from '@/screens/FavoritesScreen'
import { SetBuilderScreen }        from '@/screens/SetBuilderScreen'
import { CustomSetBuilderScreen }  from '@/screens/CustomSetBuilderScreen'
import { LoadingScreen }   from '@/components/LoadingScreen'
import { seedDB }          from '@/api/client'

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
      { path: '/my-sets',     element: <CustomSetBuilderScreen /> },
    ],
  },
], { basename: import.meta.env.BASE_URL.replace(/\/$/, '') })

export default function App() {
  const [seedDone, setSeedDone] = useState(false)

  useEffect(() => {
    const min = new Promise<void>(r => setTimeout(r, 1600))
    Promise.all([seedDB(), min]).then(() => setSeedDone(true))
  }, [])

  return (
    <>
      <RouterProvider router={router} />
      <LoadingScreen seedDone={seedDone} />
    </>
  )
}
