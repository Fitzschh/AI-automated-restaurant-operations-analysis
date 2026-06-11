import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getAllCategories,
  loadCategoryItems,
  loadAppSettings,
  onCategoriesChange,
  onAppSettingsChange,
} from '../lib/menuApi';
import AddItemForm from '../components/menu/AddItemForm';
import AddCategoryBox from '../components/menu/AddCategoryBox';
import CategorySection from '../components/menu/CategorySection';
import ItemCard from '../components/menu/ItemCard';
import SettingsPanel, { THEMES } from '../components/menu/SettingsPanel';
import styles from '../components/menu/MenuPage.module.css';

export default function MenuPage({ branchId: propBranchId }) {
  const navigate = useNavigate();
  const params = useParams();
  const branchId = propBranchId || params.branchId;
  const { user, nickname, logout } = useAuth();
  const [categories, setCategories] = useState([]);
  const [categoryItems, setCategoryItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [showAddItem, setShowAddItem] = useState(false);
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false);
  const [appSettings, setAppSettings] = useState({});
  const [currentSlide, setCurrentSlide] = useState(0);
  const autoSlideRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!branchId) return;
    const list = await getAllCategories(branchId);
    setCategories(list);
    const items = {};
    await Promise.all(
      list.map(async (cat) => {
        try {
          const data = await loadCategoryItems(branchId, cat);
          items[cat] = data;
        } catch (err) {
          console.error(`Error loading ${cat}:`, err);
          items[cat] = {};
        }
      })
    );
    setCategoryItems(items);
  }, [branchId]);

  // Real-time listener for categories + items
  useEffect(() => {
    if (!branchId) return;
    const unsubscribe = onCategoriesChange(branchId, (catList, items) => {
      setCategories(catList);
      setCategoryItems(items);
      setLoading(false);
    });
    return unsubscribe;
  }, [branchId]);

  // Real-time listener for app settings
  useEffect(() => {
    if (!branchId) return;
    const unsubscribe = onAppSettingsChange(branchId, (settings) => {
      setAppSettings(settings);
    });
    return unsubscribe;
  }, [branchId]);

  // Build best sellers list
  const bestSellersList = [];
  Object.entries(categoryItems).forEach(([cat, items]) => {
    if (items && typeof items === 'object') {
      Object.entries(items).forEach(([itemKey, item]) => {
        if (item && item.isBestSeller === true) {
          bestSellersList.push({ category: cat, itemKey, item });
        }
      });
    }
  });

  // Auto-slide for carousel
  useEffect(() => {
    if (bestSellersList.length <= 1) return;
    autoSlideRef.current = setInterval(() => {
      setCurrentSlide((prev) =>
        prev >= bestSellersList.length - 1 ? 0 : prev + 1
      );
    }, 5000);
    return () => clearInterval(autoSlideRef.current);
  }, [bestSellersList.length]);

  function goToSlide(index) {
    setCurrentSlide(index);
    // Reset auto-slide timer
    clearInterval(autoSlideRef.current);
    if (bestSellersList.length > 1) {
      autoSlideRef.current = setInterval(() => {
        setCurrentSlide((prev) =>
          prev >= bestSellersList.length - 1 ? 0 : prev + 1
        );
      }, 5000);
    }
  }

  function prevSlide() {
    goToSlide(currentSlide <= 0 ? bestSellersList.length - 1 : currentSlide - 1);
  }

  function nextSlide() {
    goToSlide(currentSlide >= bestSellersList.length - 1 ? 0 : currentSlide + 1);
  }

  // Compute background style
  let backgroundStyle = {};
  backgroundStyle.backgroundSize = 'cover';
  backgroundStyle.backgroundAttachment = 'fixed';
  backgroundStyle.backgroundPosition = 'center';

  // Apply theme color
  const activeTheme = THEMES.find(t => t.id === appSettings?.backgroundTheme) || THEMES[0];
  backgroundStyle.backgroundColor = activeTheme.color;

  if (appSettings?.backgroundImage) {
    backgroundStyle.backgroundImage = `url(${appSettings.backgroundImage})`;
  } else {
    // Default background image
    backgroundStyle.backgroundImage = `url(/background_image.jpg.webp)`;
  }

  if (!branchId) return <div className={styles.loadingWrap}><p className={styles.loading}>No branch selected</p></div>;

  return (
    <div className={styles.menuPageWrap} style={backgroundStyle}>
      <header className={styles.menuHeader}>
        <h1>Gureum Menu</h1>
        <div className={styles.menuHeaderActions}>
          <span className={styles.userName}>Hello {nickname || user?.email?.split('@')[0] || 'User'}</span>
          <button
            type="button"
            className={styles.hamburgerBtn}
            onClick={() => setSettingsPanelOpen(true)}
            aria-label="Open settings"
            title="Settings"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </header>

      <SettingsPanel
        isOpen={settingsPanelOpen}
        onClose={() => setSettingsPanelOpen(false)}
        currentTheme={appSettings?.backgroundTheme}
        currentImage={appSettings?.backgroundImage}
        branchId={branchId}
        showNickname={false}
        onSettingsUpdate={() => {
          refresh();
        }}
      />

      <div className={styles.menuContent}>
        {/* Add Item Toggle */}
        <div className={styles.topActions}>
          <button
            type="button"
            className={styles.addItemToggle}
            onClick={() => setShowAddItem(!showAddItem)}
          >
            {showAddItem ? '✕ Close' : '＋ Add New Item'}
          </button>
        </div>

        {/* Collapsible Form */}
        <div className={`${styles.addItemSlide} ${showAddItem ? styles.addItemSlideOpen : ''}`}>
          <AddItemForm
            branchId={branchId}
            onItemAdded={() => { refresh(); setShowAddItem(false); }}
            categoryOptions={categories}
          />
          <AddCategoryBox branchId={branchId} onCategoryAdded={refresh} />
        </div>

        {loading ? (
          <div className={styles.loadingWrap}>
            <div className={styles.spinner} />
            <p className={styles.loading}>Loading menu…</p>
          </div>
        ) : (
          <>
            {/* Best Sellers — Stacked Card Carousel */}
            {bestSellersList.length > 0 && (
              <section className={styles.bestSellersSection}>
                <div className={styles.bestSellersHeader}>
                  <h2>Best Sellers</h2>
                  <p className={styles.bestSellersSubtitle}>Our most popular items</p>
                </div>

                <div className={styles.carouselStage}>
                  {bestSellersList.map(({ category: cat, itemKey, item }, index) => {
                    const offset = index - currentSlide;
                    // Show current, previous, and next cards only
                    const isVisible = Math.abs(offset) <= 1 ||
                      (currentSlide === 0 && index === bestSellersList.length - 1) ||
                      (currentSlide === bestSellersList.length - 1 && index === 0);

                    let wrapOffset = offset;
                    if (currentSlide === 0 && index === bestSellersList.length - 1) wrapOffset = -1;
                    if (currentSlide === bestSellersList.length - 1 && index === 0) wrapOffset = 1;

                    return (
                      <div
                        key={`${cat}-${itemKey}`}
                        className={styles.carouselCard}
                        style={{
                          transform: `translateX(${wrapOffset * 70}%) scale(${wrapOffset === 0 ? 1 : 0.85})`,
                          zIndex: wrapOffset === 0 ? 3 : 1,
                          opacity: isVisible ? (wrapOffset === 0 ? 1 : 0.5) : 0,
                          pointerEvents: wrapOffset === 0 ? 'auto' : 'none',
                        }}
                      >
                        <ItemCard
                          branchId={branchId}
                          item={item}
                          itemKey={itemKey}
                          category={cat}
                          onUpdate={refresh}
                          variant="bestseller"
                        />
                      </div>
                    );
                  })}

                  {bestSellersList.length > 1 && (
                    <>
                      <button
                        type="button"
                        className={`${styles.carouselArrow} ${styles.carouselArrowLeft}`}
                        onClick={prevSlide}
                      >‹</button>
                      <button
                        type="button"
                        className={`${styles.carouselArrow} ${styles.carouselArrowRight}`}
                        onClick={nextSlide}
                      >›</button>
                    </>
                  )}
                </div>

                {/* Dots */}
                {bestSellersList.length > 1 && (
                  <div className={styles.carouselDots}>
                    {bestSellersList.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        className={`${styles.dot} ${i === currentSlide ? styles.dotActive : ''}`}
                        onClick={() => goToSlide(i)}
                      />
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Category Sections */}
            {categories.map((cat) => (
              <CategorySection
                key={cat}
                branchId={branchId}
                categoryName={cat}
                items={categoryItems[cat]}
                onUpdate={refresh}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
