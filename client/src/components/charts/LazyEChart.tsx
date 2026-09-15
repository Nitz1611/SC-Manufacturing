import { lazy, Suspense, useEffect, useRef, type CSSProperties } from 'react';
import type { EChartsOption } from 'echarts';

const EChartCore = lazy(async () => {
  const echarts = await import('echarts');
  return {
    default: function EChartCore({
      option,
      className,
      style,
    }: {
      option: EChartsOption;
      className?: string;
      style?: CSSProperties;
    }) {
      const ref = useRef<HTMLDivElement>(null);
      const chartRef = useRef<ReturnType<typeof echarts.init> | null>(null);

      useEffect(() => {
        if (!ref.current) return;
        chartRef.current = echarts.init(ref.current);
        return () => {
          chartRef.current?.dispose();
          chartRef.current = null;
        };
      }, []);

      useEffect(() => {
        chartRef.current?.setOption(option, true);
      }, [option]);

      useEffect(() => {
        const onResize = () => chartRef.current?.resize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
      }, []);

      return <div ref={ref} className={className} style={{ width: '100%', height: '100%', ...style }} />;
    },
  };
});

/** Lazy-loaded ECharts canvas — use for new React-native chart components. */
export function LazyEChart(props: { option: EChartsOption; className?: string; style?: CSSProperties }) {
  return (
    <Suspense fallback={<div className="chart-loading">Loading chart…</div>}>
      <EChartCore {...props} />
    </Suspense>
  );
}
