$(function () {
    "use strict";

    let currentPeriod = "all";
    let currentSemesterId = "";
    const charts = {};

    // ============ Period Tabs ============
    $(".period-btn").on("click", function () {
        $(".period-btn").removeClass("bg-indigo-600 text-white shadow").addClass("text-gray-600 hover:bg-gray-100");
        $(this).addClass("bg-indigo-600 text-white shadow").removeClass("text-gray-600 hover:bg-gray-100");
        currentPeriod = $(this).data("period");

        if (currentPeriod === "semester") {
            $("#semester-filter").removeClass("hidden");
        } else {
            $("#semester-filter").addClass("hidden");
        }
        loadAll();
    });

    // ============ Semester Filter ============
    $.getJSON("/api/semesters", function (data) {
        const $sel = $("#semester-filter");
        $sel.html('<option value="">All Semesters</option>');
        data.forEach(function (s) {
            $sel.append('<option value="' + s.id + '">' + $("<span>").text(s.name).html() + '</option>');
        });
    });

    $("#semester-filter").on("change", function () {
        currentSemesterId = $(this).val();
        loadAll();
    });

    // ============ Helpers ============
    function qs() {
        let p = "?period=" + currentPeriod;
        if (currentSemesterId) p += "&semester_id=" + currentSemesterId;
        return p;
    }

    function destroyChart(key) {
        if (charts[key]) {
            charts[key].destroy();
            charts[key] = null;
        }
    }

    // ============ Load All ============
    function loadAll() {
        loadSummary();
        loadHoursByUnit();
        loadDailyTrend();
        loadHeatmap();
        loadTaskCompletion();
    }

    // ============ Summary Cards ============
    function loadSummary() {
        $.getJSON("/api/stats/summary" + qs(), function (d) {
            $("#stat-total-hours").text(d.total_hours.toFixed(1));
            $("#stat-sessions").text(d.session_count);
            $("#stat-avg").text(d.avg_minutes + "m");
            $("#stat-streak").text(d.current_streak + "d");
            $("#stat-best-streak").text(d.longest_streak + "d");
        });
    }

    // ============ Hours by Unit (horizontal bar) ============
    function loadHoursByUnit() {
        $.getJSON("/api/stats/hours-by-unit" + qs(), function (data) {
            destroyChart("hoursBar");
            if (!data.length) {
                $("#chart-hours-by-unit").html("");
                $("#hours-empty").removeClass("hidden");
                // Also update donut
                destroyChart("donut");
                $("#chart-donut").html("");
                $("#donut-empty").removeClass("hidden");
                return;
            }
            $("#hours-empty").addClass("hidden");

            const labels = data.map(function (d) { return d.code || d.name; });
            const hours = data.map(function (d) { return parseFloat(d.hours.toFixed(1)); });
            const colors = data.map(function (d) { return d.color || "#6366f1"; });

            charts.hoursBar = new ApexCharts(document.querySelector("#chart-hours-by-unit"), {
                chart: {
                    type: "bar",
                    height: window.innerWidth < 640 ? Math.max(220, labels.length * 34) : Math.max(200, labels.length * 42),
                    toolbar: { show: false },
                    fontFamily: "Roboto, sans-serif"
                },
                series: [{ name: "Hours", data: hours }],
                plotOptions: { bar: { horizontal: true, borderRadius: 6, barHeight: "60%" } },
                colors: colors,
                dataLabels: { enabled: true, formatter: function (v) { return v + "h"; }, style: { fontSize: "12px" } },
                xaxis: { categories: labels, labels: { style: { fontSize: "13px" } } },
                yaxis: { labels: { style: { fontSize: "13px", fontFamily: "Montserrat, sans-serif" } } },
                tooltip: { y: { formatter: function (v) { return v + " hours"; } } },
                grid: { borderColor: "#f3f4f6" }
            });
            charts.hoursBar.render();

            // Also render donut from same data
            renderDonut(data);
        });
    }

    // ============ Time Distribution (donut) ============
    function renderDonut(data) {
        destroyChart("donut");
        if (!data.length) {
            $("#chart-donut").html("");
            $("#donut-empty").removeClass("hidden");
            return;
        }
        $("#donut-empty").addClass("hidden");

        const labels = data.map(function (d) { return d.code || d.name; });
        const hours = data.map(function (d) { return parseFloat(d.hours.toFixed(1)); });
        const colors = data.map(function (d) { return d.color || "#6366f1"; });

        charts.donut = new ApexCharts(document.querySelector("#chart-donut"), {
            chart: {
                type: "donut",
                height: window.innerWidth < 640 ? 240 : 300,
                fontFamily: "Roboto, sans-serif"
            },
            series: hours,
            labels: labels,
            colors: colors,
            legend: { position: "bottom", fontFamily: "Montserrat, sans-serif", fontSize: "13px" },
            dataLabels: { enabled: true, formatter: function (val) { return val.toFixed(0) + "%"; } },
            plotOptions: { pie: { donut: { size: "58%", labels: { show: true, total: { show: true, label: "Total", formatter: function (w) { return w.globals.seriesTotals.reduce(function (a, b) { return a + b; }, 0).toFixed(1) + "h"; } } } } } },
            tooltip: { y: { formatter: function (v) { return v + " hours"; } } }
        });
        charts.donut.render();
    }

    // ============ Daily Study Trend (area) ============
    function loadDailyTrend() {
        $.getJSON("/api/stats/daily-trend" + qs(), function (data) {
            destroyChart("trend");
            if (!data.length) {
                $("#chart-daily-trend").html("");
                $("#trend-empty").removeClass("hidden");
                return;
            }
            $("#trend-empty").addClass("hidden");

            const dates = data.map(function (d) { return d.date; });
            const hours = data.map(function (d) { return parseFloat(d.hours.toFixed(2)); });

            charts.trend = new ApexCharts(document.querySelector("#chart-daily-trend"), {
                chart: {
                    type: "area",
                    height: window.innerWidth < 640 ? 240 : 300,
                    toolbar: { show: false },
                    fontFamily: "Roboto, sans-serif",
                    zoom: { enabled: false }
                },
                series: [{ name: "Hours", data: hours }],
                xaxis: { categories: dates, type: "category", labels: { rotate: -45, style: { fontSize: "11px" }, formatter: function (val) { if (!val) return ""; const parts = val.split("-"); return parts[2] + "/" + parts[1]; } }, tickAmount: Math.min(dates.length, 15) },
                yaxis: { labels: { formatter: function (v) { return v.toFixed(1) + "h"; } } },
                colors: ["#725AEA"],
                fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.05, stops: [0, 100] } },
                stroke: { curve: "smooth", width: 2.5 },
                dataLabels: { enabled: false },
                grid: { borderColor: "#f3f4f6" },
                tooltip: { y: { formatter: function (v) { return v + " hours"; } } }
            });
            charts.trend.render();
        });
    }

    // ============ Peak Study Hours (heatmap) ============
    function loadHeatmap() {
        const isMobile = window.innerWidth < 640;
        $.getJSON("/api/stats/hourly-heatmap" + qs(), function (data) {
            destroyChart("heatmap");

            const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
            const series = [];

            for (let d = 0; d < 7; d++) {
                const dayRow = { name: dayNames[d], data: [] };
                for (let h = 6; h <= 23; h++) {
                    const key = d + "-" + h;
                    let val = 0;
                    data.forEach(function (item) {
                        if (item.day === d && item.hour === h) val = item.minutes;
                    });
                    dayRow.data.push({ x: h + ":00", y: val });
                }
                series.push(dayRow);
            }

            // Detect dark mode
            const isDarkMode = document.documentElement.classList.contains('dark');
            
            // Define colors based on mode
            const zeroColor = isDarkMode ? "#2d3148" : "#f3f4f6";
            const lightColor = isDarkMode ? "#4f46e5" : "#c7d2fe";
            const mediumColor = isDarkMode ? "#6366f1" : "#818cf8";
            const highColor = isDarkMode ? "#818cf8" : "#6366f1";
            const veryHighColor = isDarkMode ? "#a78bfa" : "#4338ca";

            charts.heatmap = new ApexCharts(document.querySelector("#chart-heatmap"), {
                chart: {
                    type: "heatmap",
                    height: 280,
                    toolbar: { show: false },
                    fontFamily: "Roboto, sans-serif",
                    parentHeightOffset: 0
                },
                series: series,
                colors: ["#725AEA"],
                dataLabels: { enabled: false },

                legend: {
                    position: "bottom",
                    fontSize: isMobile ? "10px" : "12px",
                    markers: {
                        width: isMobile ? 8 : 12,
                        height: isMobile ? 8 : 12
                    },
                    itemMargin: {
                        horizontal: isMobile ? 4 : 8,
                        vertical: isMobile ? 2 : 4
                    }
                },

                xaxis: {
                    labels: {
                        rotate: isMobile ? 0 : -45,
                        style: {
                            fontSize: isMobile ? "9px" : "11px",
                            colors: isDarkMode ? "#94a3b8" : undefined
                        },
                        formatter: function (val) {
                            if (!isMobile) return val;

                            const hour = parseInt(String(val).split(":")[0]);
                            if (hour % 3 === 0) {
                                return hour + ":00";
                            }
                            return "";
                        }
                    }
                },

                yaxis: {
                    labels: {
                        minWidth: 36,
                        maxWidth: 36,
                        style: {
                            fontSize: "12px",
                            fontFamily: "Montserrat, sans-serif",
                            colors: isDarkMode ? "#94a3b8" : undefined
                        }
                    }
                },

                plotOptions: {
                    heatmap: {
                        radius: isMobile ? 2 : 4,
                        colorScale: {
                            ranges: [
                                { from: 0, to: 0, color: zeroColor, name: "None" },
                                { from: 1, to: 30, color: lightColor, name: "< 30m" },
                                { from: 31, to: 60, color: mediumColor, name: "30-60m" },
                                { from: 61, to: 120, color: highColor, name: "1-2h" },
                                { from: 121, to: 9999, color: veryHighColor, name: "> 2h" }
                            ]
                        }
                    }
                },
                grid: {
                    padding: {
                        left: 8,
                        right: 8
                    },
                    borderColor: isDarkMode ? "#2d3148" : "#f3f4f6"
                },

                tooltip: {
                    y: {
                        formatter: function (v) {
                            return v + " min";
                        }
                    },
                    theme: isDarkMode ? "dark" : "light"
                }
            });
            charts.heatmap.render();
        });
    }

    // ============ Task Completion by Unit ============
    function loadTaskCompletion() {
        $.getJSON("/api/stats/task-completion" + qs(), function (data) {
            destroyChart("tasks");
            if (!data.length) {
                $("#chart-task-completion").html("");
                $("#tasks-empty").removeClass("hidden");
                return;
            }
            $("#tasks-empty").addClass("hidden");

            const isDarkMode = document.documentElement.classList.contains('dark');
            const labels = data.map(function (d) { return d.code || d.name; });
            const completed = data.map(function (d) { return d.completed; });
            const remaining = data.map(function (d) { return d.total - d.completed; });

            charts.tasks = new ApexCharts(document.querySelector("#chart-task-completion"), {
                chart: {
                    type: "bar",
                    height: window.innerWidth < 640 ? Math.max(220, labels.length * 32) : Math.max(220, labels.length * 40),
                    stacked: true,
                    toolbar: { show: false },
                    fontFamily: "Roboto, sans-serif"
                },
                series: [
                    { name: "Completed", data: completed },
                    { name: "Remaining", data: remaining }
                ],
                plotOptions: { bar: { horizontal: true, borderRadius: 4, barHeight: "55%" } },
                colors: ["#10b981", isDarkMode ? "#2d3148" : "#e5e7eb"],
                xaxis: { 
                    categories: labels,
                    labels: {
                        style: {
                            colors: isDarkMode ? "#94a3b8" : undefined
                        }
                    }
                },
                yaxis: { 
                    labels: { 
                        style: { 
                            fontSize: "13px", 
                            fontFamily: "Montserrat, sans-serif",
                            colors: isDarkMode ? "#94a3b8" : undefined
                        } 
                    } 
                },
                legend: { 
                    position: "top", 
                    fontFamily: "Montserrat, sans-serif",
                    labels: {
                        colors: isDarkMode ? "#cbd5e1" : undefined
                    }
                },
                dataLabels: { 
                    enabled: false,
                    style: {
                        colors: isDarkMode ? ["#f1f5f9", "#94a3b8"] : undefined
                    }
                },
                grid: { 
                    borderColor: isDarkMode ? "#2d3148" : "#f3f4f6" 
                },
                tooltip: { 
                    y: { formatter: function (v) { return v + " tasks"; } },
                    theme: isDarkMode ? "dark" : "light"
                }
            });
            charts.tasks.render();
        });
    }

    // ============ Init ============
    loadAll();
});
