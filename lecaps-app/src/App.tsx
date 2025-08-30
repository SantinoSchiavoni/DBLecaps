import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "./supabaseClient"

/* ============= Helpers ============= */
function diffDaysUTC(a: Date, b: Date) {
  const ms =
    Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) -
    Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)))
}
function fmtPct(x: number | null | undefined, decimals = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return "-"
  return (x * 100).toFixed(decimals) + "%"
}
function fmtNumber(
  x: number | null | undefined,
  maxDecimals = 7,
  minDecimals = 0
) {
  if (x === null || x === undefined || Number.isNaN(x)) return "-"
  return Number(x).toLocaleString(undefined, {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  })
}
function computeMetrics(row: any) {
  const cantidad = Number(row.cantidad || 0)
  const pc = Number(row.precio_compra || 0)
  const pf = Number(row.precio_finish || 0)
  const P = cantidad * pc
  const VF = cantidad * pf
  const d0 = row.fecha_compra ? new Date(row.fecha_compra) : new Date()
  const d1 = row.fecha_finish ? new Date(row.fecha_finish) : new Date()
  const dias = diffDaysUTC(d1, d0)
  if (P <= 0 || VF <= 0) {
    return { dias, P: 0, VF: 0, tna: NaN, tea: NaN, ytm: NaN, ret: NaN }
  }
  const ret = (VF - P) / P
  const tna = ret * (365 / dias)
  const tea = Math.pow(VF / P, 365 / dias) - 1
  const ytm = tea
  return { dias, P, VF, tna, tea, ytm, ret }
}
function minDateStr(a: string, b: string) {
  if (!a) return b
  if (!b) return a
  return new Date(a) <= new Date(b) ? a : b
}
function maxDateStr(a: string, b: string) {
  if (!a) return b
  if (!b) return a
  return new Date(a) >= new Date(b) ? a : b
}

/* ============= App ============= */
export default function App() {
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setSession(s)
    )
    return () => sub.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-gray-700">
        Cargando…
      </div>
    )
  }

  if (!session) return <AuthScreen />
  return <Dashboard user={session.user} />
}

/* ============= Auth Screen ============= */
function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        setMsg("Revisá tu mail para confirmar la cuenta.")
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      }
    } catch (err: any) {
      setMsg(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

return (
  <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 space-y-4">
      <div className="flex flex-col items-center gap-2">
        <img
          src="/lecaps.svg"
          alt="LECAPs"
          className="w-12 h-12 rounded-lg shadow-sm"
        />
        <h1 className="text-2xl font-semibold text-gray-900 text-center">
          Controlá tus LECAPs
        </h1>
      </div>

      <div className="flex gap-2 justify-center text-sm">
        <button
          className={`px-3 py-1 rounded-full ${
            mode === "signin"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-800"
          }`}
          onClick={() => setMode("signin")}
        >
          Iniciar sesión
        </button>
        <button
          className={`px-3 py-1 rounded-full ${
            mode === "signup"
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-800"
          }`}
          onClick={() => setMode("signup")}
        >
          Crear cuenta
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          required
          type="email"
          placeholder="tu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded-xl px-3 py-2"
        />
        <input
          required
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded-xl px-3 py-2"
        />
        <button
          disabled={busy}
          className="w-full rounded-xl py-2 bg-black text-white shadow"
        >
          {busy ? "Procesando…" : mode === "signup" ? "Registrarme" : "Entrar"}
        </button>
        {msg && <p className="text-sm text-center text-red-600">{msg}</p>}
      </form>
    </div>
  </div>
)

}

/* ============= Dashboard ============= */
type LastAction =
  | { type: "delete"; row: any }
  | { type: "update"; before: any; after: any }
  | null

function Dashboard({ user }: { user: any }) {
  // portfolios
  const [portfolios, setPortfolios] = useState<any[]>([])
  const [currentPid, setCurrentPid] = useState<string | null>(null)

  // holdings
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // form add
  const [form, setForm] = useState<any>({
    ticker: "",
    precio_compra: "",
    precio_finish: "",
    fecha_compra: "",
    fecha_finish: "",
    cantidad: "",
  })

  // edit inline
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({
    ticker: "",
    precio_compra: "",
    precio_finish: "",
    fecha_compra: "",
    fecha_finish: "",
    cantidad: "",
  })

  // undo
  const [lastAction, setLastAction] = useState<LastAction>(null)

  // ------ Portfolios ------
  async function loadPortfolios() {
    const { data, error } = await supabase
      .from("portfolios")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
    if (error) throw error
    if (!data || data.length === 0) {
      // crear "General" si no tiene ninguna
      const { data: created, error: errIns } = await supabase
        .from("portfolios")
        .insert({ name: "General", user_id: user.id })
        .select()
        .single()
      if (errIns) throw errIns
      setPortfolios([created])
      setCurrentPid(created.id)
    } else {
      setPortfolios(data)
      setCurrentPid((pid) => pid ?? data[0].id)
    }
  }

  async function createPortfolio() {
    const name = prompt("Nombre de la nueva cartera:", "Cartera 2")
    if (!name) return
    const { data, error } = await supabase
      .from("portfolios")
      .insert({ name: name.trim(), user_id: user.id })
      .select()
      .single()
    if (error) return alert(error.message)
    setPortfolios((p) => [...p, data])
    setCurrentPid(data.id)
    load()
  }

  // ------ Holdings ------
  async function load() {
    if (!currentPid) return
    setLoading(true)
    const { data, error } = await supabase
      .from("holdings")
      .select("*")
      .eq("user_id", user.id)
      .eq("portfolio_id", currentPid)
      .order("fecha_finish", { ascending: true })
    if (error) console.error(error)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => {
    loadPortfolios().catch((e) => alert(e.message))
  }, [])

  useEffect(() => {
    if (currentPid) load()
  }, [currentPid])

  // PPC + CONSOLIDACIÓN por ticker dentro de la cartera activa (ADD)
  async function addRow(e: React.FormEvent) {
    e.preventDefault()
    if (!currentPid) return alert("Elegí una cartera")
    const ticker = String(form.ticker || "").trim().toUpperCase()
    const cantNueva = Number(form.cantidad) || 0
    const precioNuevo = Number(form.precio_compra) || 0
    const precioFinishNuevo = Number(form.precio_finish) || 0
    const fechaCompraNueva = form.fecha_compra
    const fechaFinishNueva = form.fecha_finish

    if (!ticker) return alert("Falta el ticker")
    if (!precioNuevo || !precioFinishNuevo) return alert("Cargá precios válidos")
    if (!cantNueva) return alert("Cargá una cantidad válida")
    if (!fechaCompraNueva || !fechaFinishNueva)
      return alert("Completá las fechas")

    // Buscar filas existentes de ese ticker en la cartera actual
    const { data: existentes, error: errSel } = await supabase
      .from("holdings")
      .select("*")
      .eq("user_id", user.id)
      .eq("portfolio_id", currentPid)
      .eq("ticker", ticker)

    if (errSel) return alert(errSel.message)

    if (!existentes || existentes.length === 0) {
      const { error } = await supabase.from("holdings").insert({
        ticker,
        precio_compra: precioNuevo,
        precio_finish: precioFinishNuevo,
        fecha_compra: fechaCompraNueva,
        fecha_finish: fechaFinishNueva,
        cantidad: cantNueva,
        user_id: user.id,
        portfolio_id: currentPid,
      })
      if (error) return alert(error.message)
    } else {
      // consolidar en la primera fila; borrar duplicados
      const agg = existentes.reduce(
        (acc: any, r: any) => {
          const c = Number(r.cantidad || 0)
          const p = Number(r.precio_compra || 0)
          acc.sumaCant += c
          acc.sumaCosto += c * p
          acc.minCompra = minDateStr(acc.minCompra, r.fecha_compra)
          acc.maxFinish = maxDateStr(acc.maxFinish, r.fecha_finish)
          acc.ids.push(r.id)
          return acc
        },
        {
          sumaCant: 0,
          sumaCosto: 0,
          minCompra: fechaCompraNueva,
          maxFinish: fechaFinishNueva,
          ids: [] as string[],
        }
      )
      const totalCant = agg.sumaCant + cantNueva
      const totalCosto = agg.sumaCosto + cantNueva * precioNuevo
      const ppc = totalCosto / totalCant
      const fechaCompraFinal = minDateStr(agg.minCompra, fechaCompraNueva)
      const fechaFinishFinal = maxDateStr(agg.maxFinish, fechaFinishNueva)
      const idToKeep = agg.ids[0]
      const idsToDelete = agg.ids.slice(1)

      // guardar before para posible undo (update)
      const beforeRow = existentes.find((r: any) => r.id === idToKeep)

      const { error: errUpd } = await supabase
        .from("holdings")
        .update({
          cantidad: totalCant,
          precio_compra: ppc,
          precio_finish: precioFinishNuevo, // tomamos el último
          fecha_compra: fechaCompraFinal,
          fecha_finish: fechaFinishFinal,
          portfolio_id: currentPid,
        })
        .eq("id", idToKeep)
        .eq("user_id", user.id)

      if (errUpd) return alert(errUpd.message)

      if (idsToDelete.length > 0) {
        const { error: errDel } = await supabase
          .from("holdings")
          .delete()
          .in("id", idsToDelete)
          .eq("user_id", user.id)
        if (errDel) return alert(errDel.message)
      }

      // Registramos la acción como update (after la recargamos)
      setLastAction({ type: "update", before: beforeRow, after: null })
    }

    setForm({
      ticker: "",
      precio_compra: "",
      precio_finish: "",
      fecha_compra: "",
      fecha_finish: "",
      cantidad: "",
    })
    load()
  }

  // ------ Editar ------
  function startEdit(r: any) {
    setEditingId(r.id)
    setEditForm({
      ticker: r.ticker,
      precio_compra: String(r.precio_compra),
      precio_finish: String(r.precio_finish),
      fecha_compra: r.fecha_compra,
      fecha_finish: r.fecha_finish,
      cantidad: String(r.cantidad),
    })
  }
  function cancelEdit() {
    setEditingId(null)
  }
  async function saveEdit(id: string) {
    if (!currentPid) return
    const payload = {
      ticker: String(editForm.ticker || "").trim().toUpperCase(),
      precio_compra: Number(editForm.precio_compra) || 0,
      precio_finish: Number(editForm.precio_finish) || 0,
      fecha_compra: editForm.fecha_compra,
      fecha_finish: editForm.fecha_finish,
      cantidad: Number(editForm.cantidad) || 0,
    }
    if (!payload.ticker) return alert("Falta el ticker")
    if (!payload.precio_compra || !payload.precio_finish)
      return alert("Cargá precios válidos")
    if (!payload.cantidad) return alert("Cargá una cantidad válida")

    const before = rows.find((r) => r.id === id)

    const { error } = await supabase
      .from("holdings")
      .update({ ...payload })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("portfolio_id", currentPid)
    if (error) return alert(error.message)

    setLastAction({ type: "update", before, after: { id, ...payload } })
    setEditingId(null)
    load()
  }

  // ------ Eliminar ------
  async function removeRow(id: string) {
    const row = rows.find((r) => r.id === id)
    const ok = confirm("¿Eliminar registro?")
    if (!ok) return
    const { error } = await supabase
      .from("holdings")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id)
    if (error) return alert(error.message)
    setLastAction({ type: "delete", row })
    load()
  }

  // ------ Deshacer ------
  async function undo() {
    if (!lastAction) return
    if (lastAction.type === "delete") {
      const r = lastAction.row
      const { error } = await supabase.from("holdings").insert({
        id: r.id, // reinsertar con el mismo id está permitido si no existe
        user_id: r.user_id,
        portfolio_id: r.portfolio_id,
        ticker: r.ticker,
        precio_compra: r.precio_compra,
        precio_finish: r.precio_finish,
        fecha_compra: r.fecha_compra,
        fecha_finish: r.fecha_finish,
        cantidad: r.cantidad,
        created_at: r.created_at,
      })
      if (error) return alert(error.message)
    } else if (lastAction.type === "update") {
      const b = lastAction.before
      if (b) {
        const { error } = await supabase
          .from("holdings")
          .update({
            ticker: b.ticker,
            precio_compra: b.precio_compra,
            precio_finish: b.precio_finish,
            fecha_compra: b.fecha_compra,
            fecha_finish: b.fecha_finish,
            cantidad: b.cantidad,
          })
          .eq("id", b.id)
          .eq("user_id", user.id)
        if (error) return alert(error.message)
      }
    }
    setLastAction(null)
    load()
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const totals = useMemo(() => {
    let inv = 0,
      vf = 0
    rows.forEach((r) => {
      const m = computeMetrics(r)
      inv += m.P
      vf += m.VF
    })
    const diff = vf - inv
    return { inv, vf, diff }
  }, [rows])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between px-4 md:px-8 py-3 bg-white border-b">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-xl font-semibold">Tus Letras</h1>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="border rounded-xl px-3 py-1.5"
              value={currentPid ?? ""}
              onChange={(e) => setCurrentPid(e.target.value)}
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button
              onClick={createPortfolio}
              className="px-3 py-1.5 rounded-xl bg-gray-100"
            >
              Nueva cartera
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {lastAction && (
            <button
              onClick={undo}
              className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900"
              title="Deshacer último cambio"
            >
              Deshacer
            </button>
          )}
          <button onClick={load} className="px-3 py-1.5 rounded-xl bg-gray-100">
            Actualizar
          </button>
          <button
            onClick={logout}
            className="px-3 py-1.5 rounded-xl bg-black text-white"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
        <section className="grid md:grid-cols-3 gap-4">
          <Card title="Invertido">${fmtNumber(totals.inv, 2)}</Card>
          <Card title="Valor a Finish">${fmtNumber(totals.vf, 2)}</Card>
          <Card title="Resultado Bruto">
            ${fmtNumber(totals.vf - totals.inv, 2)}
          </Card>
        </section>

        <section className="bg-white rounded-2xl shadow p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-3">Agregar compra</h2>
          <form onSubmit={addRow} className="grid md:grid-cols-12 gap-3">
            <input
              className="border rounded-xl px-3 py-2 md:col-span-2"
              placeholder="Ticker (S12S5...)"
              value={form.ticker}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, ticker: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="number"
              step="0.0000000001"
              placeholder="Precio compra"
              value={form.precio_compra}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, precio_compra: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="number"
              step="0.0000000001"
              placeholder="Precio finish"
              value={form.precio_finish}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, precio_finish: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="date"
              value={form.fecha_compra}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, fecha_compra: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="date"
              value={form.fecha_finish}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, fecha_finish: e.target.value }))
              }
            />
            <input
              required
              className="border rounded-xl px-3 py-2 md:col-span-2"
              type="number"
              step="1"
              placeholder="Cantidad letras"
              value={form.cantidad}
              onChange={(e) =>
                setForm((f: any) => ({ ...f, cantidad: e.target.value }))
              }
            />
            <button className="rounded-xl px-3 py-2 bg-black text-white md:col-span-2">
              Agregar / Consolidar
            </button>
          </form>
          <p className="text-xs text-gray-500 mt-2">
            Cartera activa: se consolida por <strong>ticker</strong> con
            <strong> PPC</strong> (promedio ponderado). La compra queda con la{" "}
            <em>fecha más antigua</em> y el finish con la <em>más nueva</em>.
          </p>
        </section>

        <section className="bg-white rounded-2xl shadow p-4 md:p-6">
          <h2 className="text-lg font-semibold mb-3">Posición</h2>
          {rows.length === 0 && (
            <p className="text-sm text-gray-500">No hay registros todavía.</p>
          )}
          {rows.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left border-b">
                  <tr className="[&>th]:py-2 [&>th]:pr-3">
                    <th>Ticker</th>
                    <th>Precio compra (PPC)</th>
                    <th>Precio finish</th>
                    <th>Cant.</th>
                    <th>Invertido</th>
                    <th>Valor Finish</th>
                    <th>Días</th>
                    <th>TNA</th>
                    <th>TEA</th>
                    <th>YTM</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const m = computeMetrics(r)

                    // fila en modo edición
                    if (editingId === r.id) {
                      return (
                        <tr
                          key={r.id}
                          className="border-b last:border-0 [&>td]:py-2 [&>td]:pr-3 bg-yellow-50"
                        >
                          <td>
                            <input
                              className="border rounded px-2 py-1 w-28"
                              value={editForm.ticker}
                              onChange={(e) =>
                                setEditForm((f: any) => ({
                                  ...f,
                                  ticker: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.0000000001"
                              className="border rounded px-2 py-1 w-36"
                              value={editForm.precio_compra}
                              onChange={(e) =>
                                setEditForm((f: any) => ({
                                  ...f,
                                  precio_compra: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="0.0000000001"
                              className="border rounded px-2 py-1 w-36"
                              value={editForm.precio_finish}
                              onChange={(e) =>
                                setEditForm((f: any) => ({
                                  ...f,
                                  precio_finish: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step="1"
                              className="border rounded px-2 py-1 w-24"
                              value={editForm.cantidad}
                              onChange={(e) =>
                                setEditForm((f: any) => ({
                                  ...f,
                                  cantidad: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td colSpan={2}>
                            {/* solo display: P/VF dependen de cálculos */}
                            <span className="text-gray-500">Editando…</span>
                          </td>
                          <td>
                            <input
                              type="date"
                              className="border rounded px-2 py-1"
                              value={editForm.fecha_compra}
                              onChange={(e) =>
                                setEditForm((f: any) => ({
                                  ...f,
                                  fecha_compra: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td colSpan={2}>
                            <input
                              type="date"
                              className="border rounded px-2 py-1"
                              value={editForm.fecha_finish}
                              onChange={(e) =>
                                setEditForm((f: any) => ({
                                  ...f,
                                  fecha_finish: e.target.value,
                                }))
                              }
                            />
                          </td>
                          <td></td>
                          <td className="flex gap-2">
                            <button
                              onClick={() => saveEdit(r.id)}
                              className="text-green-700"
                            >
                              Guardar
                            </button>
                            <button onClick={cancelEdit} className="text-gray-600">
                              Cancelar
                            </button>
                          </td>
                        </tr>
                      )
                    }

                    // fila normal
                    return (
                      <tr
                        key={r.id}
                        className="border-b last:border-0 [&>td]:py-2 [&>td]:pr-3"
                      >
                        <td className="font-medium">{r.ticker}</td>
                        <td>{fmtNumber(r.precio_compra, 10)}</td>
                        <td>{fmtNumber(r.precio_finish, 10)}</td>
                        <td>{fmtNumber(r.cantidad, 0)}</td>
                        <td>{fmtNumber(m.P, 2)}</td>
                        <td>{fmtNumber(m.VF, 2)}</td>
                        <td>{m.dias}</td>
                        <td>{fmtPct(m.tna, 2)}</td>
                        <td>{fmtPct(m.tea, 2)}</td>
                        <td>{fmtPct(m.ytm, 2)}</td>
                        <td className="space-x-3">
                          <button
                            onClick={() => startEdit(r)}
                            className="text-blue-600"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => removeRow(r.id)}
                            className="text-red-600"
                          >
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

/* ============= UI helper ============= */
function Card({ title, children }: { title: string; children: any }) {
  return (
    <div className="bg-white rounded-2xl shadow p-4">
      <div className="text-xs text-gray-500">{title}</div>
      <div className="text-2xl font-semibold">{children}</div>
    </div>
  )
}
