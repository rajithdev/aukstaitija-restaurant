'use client'
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { TRANSLATIONS } from './i18n'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [lang, setLang] = useState('en')
  const [theme, setTheme] = useState('dark')
  const [cart, setCart] = useState([])
  const [tableId, setTableIdState] = useState(null)
  const [tableNumber, setTableNumber] = useState(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('aukstaitija_cart') || '[]')
      const savedLang = localStorage.getItem('aukstaitija_lang') || 'en'
      const savedTheme = localStorage.getItem('aukstaitija_theme') || 'dark'
      const savedTableId = localStorage.getItem('aukstaitija_table_id') || null
      const savedTableNum = localStorage.getItem('aukstaitija_table_number') || null
      setCart(saved)
      setLang(savedLang)
      setTheme(savedTheme)
      setTableIdState(savedTableId)
      setTableNumber(savedTableNum ? parseInt(savedTableNum) : null)
      document.documentElement.classList.toggle('dark', savedTheme === 'dark')
    } catch (e) {}
    setHydrated(true)
  }, [])

  const setTableId = useCallback((id, number) => {
    setTableIdState(id)
    setTableNumber(number || null)
    if (typeof window !== 'undefined') {
      if (id) {
        localStorage.setItem('aukstaitija_table_id', id)
        if (number) localStorage.setItem('aukstaitija_table_number', String(number))
      } else {
        localStorage.removeItem('aukstaitija_table_id')
        localStorage.removeItem('aukstaitija_table_number')
      }
    }
  }, [])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem('aukstaitija_cart', JSON.stringify(cart))
  }, [cart, hydrated])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem('aukstaitija_lang', lang)
  }, [lang, hydrated])

  useEffect(() => {
    if (!hydrated) return
    localStorage.setItem('aukstaitija_theme', theme)
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme, hydrated])

  const t = useCallback((path) => {
    const parts = path.split('.')
    let obj = TRANSLATIONS[lang] || TRANSLATIONS.en
    for (const p of parts) { obj = obj?.[p] }
    return obj || path
  }, [lang])

  const addToCart = useCallback((dish, qty = 1, notes = '') => {
    setCart(prev => {
      const existing = prev.find(i => i.id === dish.id)
      if (existing) {
        return prev.map(i => i.id === dish.id ? { ...i, quantity: i.quantity + qty } : i)
      }
      return [...prev, { id: dish.id, name: dish.name, name_lt: dish.name_lt, price: dish.price, image_url: dish.image_url, quantity: qty, notes }]
    })
  }, [])

  const updateQty = useCallback((id, qty) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(i => i.id !== id))
    } else {
      setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: qty } : i))
    }
  }, [])

  const removeFromCart = useCallback((id) => {
    setCart(prev => prev.filter(i => i.id !== id))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const cartCount = cart.reduce((s, i) => s + i.quantity, 0)
  const cartSubtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0)

  return (
    <AppContext.Provider value={{
      lang, setLang, theme, setTheme, t,
      cart, addToCart, updateQty, removeFromCart, clearCart, cartCount, cartSubtotal,
      tableId, tableNumber, setTableId,
      hydrated,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
