import React, { useState, useEffect, useRef } from 'react';
import { Plus, CheckCircle, Camera, ListChecks, Copy, Check, Calendar, LogIn, LogOut, Clock, AlertCircle, Trash2 } from 'lucide-react';
import { auth, db } from './firebase';
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth';
import { collection, query, where, onSnapshot, setDoc, doc, deleteDoc } from 'firebase/firestore';
import { toPng } from 'html-to-image';

const MENU_ITEMS = [
  { name: 'Ba rọi chiên', price: 30000, tier: 1 },
  { name: 'Cá kho', price: 30000, tier: 1 },
  { name: 'Trứng chiên thịt', price: 30000, tier: 1 },
  { name: 'Ếch kho', price: 30000, tier: 1 },
  { name: 'Sườn nướng', price: 30000, tier: 1 },
  { name: 'Thịt kho tiêu', price: 30000, tier: 1 },
  { name: 'Canh chua không cá', price: 5000, tier: 1 },
  { name: 'Đậu hũ nhồi thịt', price: 30000, tier: 1 },
  { name: 'Thịt kho tôm', price: 30000, tier: 2 },
  { name: 'Mắm chưng', price: 30000, tier: 2 },
  { name: 'Gà đùi', price: 30000, tier: 2 },
  { name: 'Lươn', price: 35000, tier: 2 },
  { name: 'Thịt kho trứng', price: 30000, tier: 3 },
  { name: 'Canh chua cá hú', price: 30000, tier: 3 },
  { name: 'Hộp cơm trắng không', price: 10000, tier: 0 },
  { name: 'Rau xào thêm', price: 5000, tier: 0 },
  { name: 'Cơm thêm', price: 0, tier: 0 },
];

const INITIAL_NAMES = [
  "Bùi Sơn Trà", "Vưu Tấn Lộc", "Nguyễn Hữu Lộc", "Nguyễn Ngọc Tiến",
  "Trần Lưu Thanh Nhân", "Nguyễn Văn Hoàng", "Nguyễn Minh Thành",
  "Vũ Đức Lâm", "Thái Minh Hiển", "Nguyễn Tiến Đạt",
  "Nguyễn Tiến Thành", "Nguyễn Trần Long Nhân", ""
];

interface Order {
  id: number;
  date: string;
  name: string;
  mainDish: string;
  extraDish: string;
  extraRice: boolean;
  paid: boolean;
}

const getLocalDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [orders, setOrders] = useState<Order[]>(
    INITIAL_NAMES.map((name, index) => ({
      id: index + 1,
      date: getLocalDateString(),
      name: name,
      mainDish: '',
      extraDish: '',
      extraRice: false,
      paid: false
    }))
  );
  
  const [date, setDate] = useState(getLocalDateString());
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  const formattedDate = new Date(date).toLocaleDateString('vi-VN');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isAuthReady) return;

    const q = query(collection(db, 'orders'), where('date', '==', date));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedOrders = snapshot.docs.map(doc => doc.data() as Order);
      const fetchedMap = new Map(fetchedOrders.map(o => [o.id, o]));
      
      const mergedOrders: Order[] = [];
      
      INITIAL_NAMES.forEach((name, index) => {
        const id = index + 1;
        if (fetchedMap.has(id)) {
          mergedOrders.push(fetchedMap.get(id)!);
          fetchedMap.delete(id);
        } else {
          mergedOrders.push({
            id,
            date,
            name,
            mainDish: '',
            extraDish: '',
            extraRice: false,
            paid: false
          });
        }
      });
      
      fetchedMap.forEach(o => mergedOrders.push(o));
      mergedOrders.sort((a, b) => a.id - b.id);
      
      setOrders(mergedOrders);
    }, (error) => {
      console.error("Firestore error:", error);
      showToast("Lỗi tải dữ liệu!");
    });
    
    return () => unsubscribe();
  }, [date, isAuthReady]);

  const showToast = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error: any) {
      console.error("Login error:", error);
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, ignore silently or show a specific message
        return;
      }
      if (error.code === 'auth/unauthorized-domain') {
        showToast("Lỗi: Domain chưa được cấp quyền trên Firebase!");
        return;
      }
      showToast("Lỗi đăng nhập!");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  const updateOrder = async (id: number, field: keyof Order, value: any) => {
    const orderToUpdate = orders.find(o => o.id === id);
    if (!orderToUpdate) return;
    
    const updatedOrder = { ...orderToUpdate, [field]: value, date };
    
    // Optimistic update
    setOrders(orders.map(o => o.id === id ? updatedOrder : o));
    
    try {
      await setDoc(doc(db, 'orders', `${date}_${id}`), updatedOrder);
    } catch (error) {
      console.error("Error updating order:", error);
      showToast("Lỗi lưu dữ liệu!");
    }
  };

  const deleteOrder = async (id: number) => {
    if (!user) return;
    
    // Optimistic update
    if (id <= INITIAL_NAMES.length) {
      const emptyOrder = { id, date, name: '', mainDish: '', extraDish: '', extraRice: false, paid: false };
      setOrders(orders.map(o => o.id === id ? emptyOrder : o));
      try {
        await setDoc(doc(db, 'orders', `${date}_${id}`), emptyOrder);
      } catch (error) {
        console.error("Error clearing order:", error);
        showToast("Lỗi xoá dữ liệu!");
      }
    } else {
      setOrders(orders.filter(o => o.id !== id));
      try {
        await deleteDoc(doc(db, 'orders', `${date}_${id}`));
      } catch (error) {
        console.error("Error deleting order:", error);
        showToast("Lỗi xoá dữ liệu!");
      }
    }
  };

  const addNewRow = async () => {
    const newId = Date.now();
    const newOrder: Order = {
      id: newId,
      date,
      name: '',
      mainDish: '',
      extraDish: '',
      extraRice: false,
      paid: false
    };
    
    // Optimistic update
    setOrders([...orders, newOrder]);
    
    try {
      await setDoc(doc(db, 'orders', `${date}_${newId}`), newOrder);
    } catch (err) {
      console.error(err);
      showToast("Lỗi thêm dòng!");
    }
  };

  const calculatePrice = (order: Order) => {
    let total = 0;
    const main = MENU_ITEMS.find(m => m.name === order.mainDish);
    const extra = MENU_ITEMS.find(m => m.name === order.extraDish);
    if (main) total += main.price;
    if (extra) total += extra.price;
    return total;
  };

  const activeOrders = orders.filter(o => o.mainDish !== '');
  const totalAmount = orders.reduce((sum, o) => sum + calculatePrice(o), 0);

  const copyToClipboard = () => {
    if (activeOrders.length === 0) {
      showToast("Chưa có ai đặt món!");
      return;
    }

    let text = `📋 TỔNG ORDER CƠM - NGÀY ${formattedDate}\n`;
    text += `--------------------------\n`;
    activeOrders.forEach((o, i) => {
      let dish = o.mainDish;
      if (o.extraDish) dish += ` + ${o.extraDish}`;
      if (o.extraRice) dish += ` (Cơm thêm)`;
      text += `${i + 1}. ${o.name || 'Hội viên'}: ${dish} - ${calculatePrice(o).toLocaleString()}đ\n`;
    });
    text += `--------------------------\n`;
    text += `💰 TỔNG CỘNG: ${totalAmount.toLocaleString()}đ`;

    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      showToast("Đã copy danh sách!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      showToast("Lỗi copy!");
    }
    document.body.removeChild(textArea);
  };

  const checkIsPastDeadline = () => {
    const selectedDateObj = new Date(date);
    selectedDateObj.setHours(0,0,0,0);
    
    const todayObj = new Date();
    todayObj.setHours(0,0,0,0);

    if (selectedDateObj < todayObj) return true;
    if (selectedDateObj > todayObj) return false;
    
    const hours = currentTime.getHours();
    const minutes = currentTime.getMinutes();
    return hours > 10 || (hours === 10 && minutes >= 30);
  };

  const isPastDeadline = checkIsPastDeadline();
  const canEdit = !!user;

  const exportAsImage = async () => {
    if (activeOrders.length === 0) {
      showToast("Chưa có món để xuất ảnh!");
      return;
    }
    
    try {
      showToast("Đang tạo ảnh...");
      if (!exportRef.current) return;
      
      const dataUrl = await toPng(exportRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        cacheBust: true,
      });
      
      const link = document.createElement('a');
      link.download = `Chi_Tiet_Order_${formattedDate.replace(/\//g, '-')}.png`;
      link.href = dataUrl;
      link.click();
      showToast("Đã xuất ảnh!");
    } catch (err) {
      console.error("Export error:", err);
      showToast("Lỗi xuất ảnh!");
    }
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto">
        
        {!user && (
          <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-xl flex items-center justify-center gap-2 text-sm font-medium shadow-sm">
            <AlertCircle size={16} />
            <span>Chế độ xem ẩn danh. Vui lòng đăng nhập để đặt món.</span>
          </div>
        )}

        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-3">
            <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
              <Calendar size={20} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black text-blue-900 uppercase tracking-tight">Cơm Trưa</h1>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-slate-100 border-none rounded-md px-2 py-0.5 text-blue-900 font-bold text-sm focus:ring-1 focus:ring-blue-500 cursor-pointer outline-none"
                />
              </div>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider">{formattedDate}</p>
                <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                  <Clock size={12} />
                  <span>{currentTime.toLocaleTimeString('vi-VN')}</span>
                </div>
                <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                {isPastDeadline ? (
                  <span className="text-[11px] font-bold text-rose-500 flex items-center gap-1">
                    <AlertCircle size={12} /> Đã quá giờ chốt cơm, hẹn gặp lại ngày mai!
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-emerald-500 flex items-center gap-1">
                    <Clock size={12} /> Hạn: 10h30
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap justify-center items-center gap-1.5">
            <button 
              onClick={copyToClipboard}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all active:scale-95 font-bold text-xs border ${copied ? 'bg-emerald-500 text-white border-emerald-500 shadow-md shadow-emerald-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 shadow-sm'}`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              <span>{copied ? 'Đã Copy' : 'Copy'}</span>
            </button>
            <button 
              onClick={exportAsImage}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all shadow-md shadow-blue-200 active:scale-95 font-bold text-xs"
            >
              <Camera size={14} />
              <span>Xuất Ảnh</span>
            </button>
            <button 
              onClick={addNewRow}
              disabled={!canEdit}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg transition-all shadow-md active:scale-95 font-bold text-xs ${!canEdit ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none' : 'bg-slate-800 hover:bg-slate-900 text-white shadow-slate-200'}`}
            >
              <Plus size={14} />
              <span>Thêm</span>
            </button>
            <div className="h-8 w-px bg-slate-200 mx-1"></div>
            {user ? (
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-7 h-7 rounded-full border border-slate-200 object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                    {user.displayName?.charAt(0) || 'U'}
                  </div>
                )}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-slate-500 hover:text-rose-500 p-1.5 rounded-lg transition-all font-bold text-xs"
                  title="Đăng xuất"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 px-3 py-2 rounded-lg transition-all font-bold text-xs"
              >
                <LogIn size={14} />
                <span>Đăng nhập</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Input Table */}
          <div className="lg:col-span-8 overflow-hidden bg-white rounded-2xl shadow-xl shadow-slate-200 border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr className="text-[10px] uppercase tracking-widest font-black text-slate-400">
                    <th className="px-4 py-3 w-10 text-center">#</th>
                    <th className="px-4 py-3">Tên Nhân Viên</th>
                    <th className="px-4 py-3">Món Chính</th>
                    <th className="px-4 py-3">Thêm</th>
                    <th className="px-4 py-3 text-center w-16">Cơm</th>
                    <th className="px-4 py-3 text-center w-16">Xoá</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orders.map((order, index) => (
                    <tr key={order.id} className="hover:bg-blue-50/20 group transition-colors">
                      <td className="px-4 py-2 text-center text-slate-300 font-mono text-[11px]">{index + 1}</td>
                      <td className="px-4 py-2">
                        <input 
                          type="text"
                          disabled={!canEdit}
                          className={`w-full bg-transparent border-none focus:ring-0 font-semibold text-sm ${!canEdit ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700'}`}
                          value={order.name}
                          placeholder="Nhập tên..."
                          onChange={(e) => updateOrder(order.id, 'name', e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select 
                          disabled={!canEdit}
                          className={`w-full bg-transparent border-none focus:ring-0 text-sm ${!canEdit ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} ${order.mainDish ? 'text-blue-600 font-bold' : 'text-slate-400'}`}
                          value={order.mainDish}
                          onChange={(e) => updateOrder(order.id, 'mainDish', e.target.value)}
                        >
                          <option value="">-- Chọn --</option>
                          {MENU_ITEMS.filter(m => m.tier > 0).map(m => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select 
                          disabled={!canEdit}
                          className={`w-full bg-transparent border-none focus:ring-0 text-xs text-slate-500 ${!canEdit ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                          value={order.extraDish}
                          onChange={(e) => updateOrder(order.id, 'extraDish', e.target.value)}
                        >
                          <option value="">Không</option>
                          {MENU_ITEMS.map(m => (
                            <option key={m.name} value={m.name}>{m.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <input 
                          type="checkbox" 
                          disabled={!canEdit}
                          className={`w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 ${!canEdit ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}
                          checked={order.extraRice}
                          onChange={(e) => updateOrder(order.id, 'extraRice', e.target.checked)}
                        />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button 
                          disabled={!canEdit}
                          onClick={() => deleteOrder(order.id)}
                          className={`p-1.5 rounded-lg transition-all ${!canEdit ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'} text-slate-400 hover:text-rose-500 hover:bg-rose-50`}
                          title="Xoá"
                        >
                          <Trash2 size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sidebar / Preview */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-blue-900 rounded-2xl p-5 text-white shadow-lg shadow-blue-200">
              <div className="flex justify-between items-center mb-4 opacity-70 uppercase text-[9px] font-black tracking-[0.2em]">
                <span>Tóm tắt</span>
                <ListChecks size={14} />
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-end border-b border-blue-800 pb-2">
                  <span className="text-blue-200 text-xs font-bold uppercase">Suất đặt:</span>
                  <span className="text-xl font-black">{activeOrders.length}</span>
                </div>
                <div className="flex justify-between items-end">
                  <span className="text-blue-200 text-xs font-bold uppercase">Tổng tiền:</span>
                  <span className="text-xl font-black text-emerald-400">{totalAmount.toLocaleString()}đ</span>
                </div>
              </div>
            </div>

            {/* Export Preview */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-1 overflow-hidden">
              <div className="bg-slate-50 rounded-t-xl px-4 py-2 border-b border-slate-200 flex justify-between items-center">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ảnh xem trước</span>
              </div>
              
              <div ref={exportRef} className="bg-white p-6 min-w-[380px]">
                <div className="text-center mb-6">
                  <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight leading-none">CHI TIẾT ĐẶT CƠM</h2>
                  <p className="text-blue-600 font-bold text-[10px] uppercase tracking-[0.2em] mt-1">Ngày {formattedDate}</p>
                </div>
                
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-200 px-3 py-2 text-left text-[10px] font-black uppercase text-slate-600">Họ Tên</th>
                      <th className="border border-slate-200 px-3 py-2 text-left text-[10px] font-black uppercase text-slate-600">Món Đặt</th>
                      <th className="border border-slate-200 px-3 py-2 text-right text-[10px] font-black uppercase text-slate-600">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeOrders.map(o => (
                      <tr key={o.id}>
                        <td className="border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-800">{o.name || '---'}</td>
                        <td className="border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 leading-tight">
                          {o.mainDish}
                          {o.extraDish ? <span className="text-blue-500"> + {o.extraDish}</span> : ''}
                          {o.extraRice ? <span className="text-emerald-600 font-bold italic"> (Cơm thêm)</span> : ''}
                        </td>
                        <td className="border border-slate-200 px-3 py-1.5 text-[12px] font-mono font-bold text-right text-slate-700">
                          {calculatePrice(o).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-slate-900 text-white">
                      <td colSpan="2" className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest">Tổng Cộng:</td>
                      <td className="px-3 py-2.5 text-right text-base font-black font-mono tracking-tighter">
                        {totalAmount.toLocaleString()}đ
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Toast */}
      {message && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 z-50">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></div>
          <span className="font-bold text-xs tracking-wide">{message}</span>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@700&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #f8fafc; }
        .font-mono { font-family: 'JetBrains Mono', monospace; }
        input[type="date"]::-webkit-calendar-picker-indicator { cursor: pointer; opacity: 0.5; filter: invert(0.2); }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}} />
    </div>
  );
};

export default App;
