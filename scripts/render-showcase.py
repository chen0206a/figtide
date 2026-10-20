"""Rebuild LabFlow's local homepage plates; no network calls or external code execution.

Adapted from Matplotlib gallery examples (source pages in sources.json).
Copyright (c) 2012- Matplotlib Development Team; All Rights Reserved.
See frontend/public/showcase/MATPLOTLIB-LICENSE.txt.
Data recipes are upstream illustrative examples, not LabFlow experimental results.
Requires Python + matplotlib + numpy; used only when rebuilding the static assets.
"""
from pathlib import Path
import hashlib
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.ticker import MaxNLocator
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'frontend/public/showcase'
INK, MID, PALE = '#202020', '#909090', '#d5d5d5'
BLUE, TEAL, COPPER = '#3976a8', '#70a6af', '#cd9a76'
plt.rcParams.update({
    'font.family': 'DejaVu Sans', 'font.size': 11.5,
    'text.color': INK, 'axes.labelcolor': '#555555',
    'xtick.color': '#686868', 'ytick.color': '#686868',
    'axes.edgecolor': '#d1d1d1', 'axes.linewidth': .7,
    'axes.spines.top': False, 'axes.spines.right': False,
    'axes.axisbelow': True, 'grid.color': '#eeeeee', 'grid.linewidth': .7,
    'xtick.major.size': 0, 'ytick.major.size': 0,
    'xtick.major.pad': 9, 'ytick.major.pad': 9,
    'legend.frameon': False, 'legend.fontsize': 10,
    'figure.facecolor': 'white', 'axes.facecolor': 'white',
    'savefig.facecolor': 'white', 'path.simplify': True,
})

def figure():
    fig, ax = plt.subplots(figsize=(7.2, 5.0))
    fig.subplots_adjust(left=.13, bottom=.17, right=.96, top=.93)
    ax.yaxis.set_major_locator(MaxNLocator(5))
    ax.grid(axis='y')
    return fig, ax

def save(fig, filename):
    fig.savefig(OUT / filename, dpi=170, metadata={'Software': 'LabFlow static showcase renderer'})
    plt.close(fig)

# fill_between_demo: keep the upstream observations, fitted line and band formula.
x = np.linspace(0, 10, 11)
y = np.array([3.9, 4.4, 10.8, 10.3, 11.2, 13.1, 14.1, 9.9, 13.9, 15.1, 12.5])
a, b = np.polyfit(x, y, 1)
est = a*x+b
err = x.std()*np.sqrt(1/len(x)+(x-x.mean())**2/np.sum((x-x.mean())**2))
fig, ax = figure()
ax.fill_between(x, est-err, est+err, color='#dce9f3', linewidth=0)
ax.plot(x, est, color=BLUE, linewidth=1.8)
ax.scatter(x, y, s=26, color=BLUE, edgecolor='white', linewidth=.8, zorder=3)
ax.set(xlabel='x', ylabel='y', xlim=(-.4, 10.4))
save(fig, 'intervals.png')

# image_annotated_heatmap: use its correlation-matrix example, not the harvest screenshot.
harvest = np.array([
    [.8,2.4,2.5,3.9,0,4,0], [2.4,0,4,1,2.7,0,0], [1.1,2.4,.8,4.3,1.9,4.4,0],
    [.6,0,.3,0,3.1,0,0], [.7,1.7,.6,2.6,2.2,6.2,0], [1.3,1.2,0,0,0,3.2,5.1],
    [.1,2,0,1.4,0,1.9,6.3]])
labels = ['Cucumber','Tomato','Lettuce','Asparagus','Potato','Wheat','Barley']
corr = np.corrcoef(harvest)
fig, ax = figure()
fig.subplots_adjust(left=.18, bottom=.22, right=.86, top=.96)
ax.grid(False)
cmap = LinearSegmentedColormap.from_list('labflow_blue', ['#f8fbfd','#b4d0e5','#255b87'])
im = ax.imshow(corr, cmap=cmap, vmin=-1, vmax=1)
ax.set_xticks(range(7), labels, rotation=38, ha='right', fontsize=9)
ax.set_yticks(range(7), labels, fontsize=9)
for spine in ax.spines.values(): spine.set_visible(False)
for row in range(7):
    for col in range(7):
        ax.text(col,row,f'{corr[row,col]:.1f}',ha='center',va='center',fontsize=8.5,
                color='white' if corr[row,col]>.55 else INK)
ax.set_xticks(np.arange(-.5,7,1), minor=True)
ax.set_yticks(np.arange(-.5,7,1), minor=True)
ax.grid(which='minor', color='white', linewidth=2)
ax.tick_params(which='minor', bottom=False, left=False)
cb = fig.colorbar(im, ax=ax, fraction=.035, pad=.04, ticks=[-1,0,1])
cb.outline.set_visible(False)
save(fig, 'heatmap.png')

# boxplot_color: original seeded fruit-weight distributions.
rng = np.random.RandomState(19680801)
weights = [rng.normal(130,10,100), rng.normal(125,20,100), rng.normal(120,30,100)]
fig, ax = figure()
boxes = ax.boxplot(weights, patch_artist=True, tick_labels=['Peaches','Oranges','Tomatoes'],
    widths=.42, medianprops={'color':INK,'linewidth':1.6},
    boxprops={'edgecolor':INK,'linewidth':1.1}, whiskerprops={'color':MID},
    capprops={'color':MID}, flierprops={'marker':'o','markersize':3,'markeredgecolor':MID})
for patch, shade in zip(boxes['boxes'], ['#adc7dd','#8db6bb','#e1b797']): patch.set_facecolor(shade)
ax.set_ylabel('Fruit weight (g)')
save(fig, 'distributions.png')

# barchart: upstream Palmer Penguins summary values (source noted in manifest).
fig, ax = figure()
x = np.arange(3)
for i,(name,vals,color) in enumerate([
    ('Bill depth',[18.35,18.43,14.98],BLUE),
    ('Bill length',[38.79,48.83,47.50],TEAL),
    ('Flipper length',[189.95,195.82,217.19],COPPER)]):
    ax.bar(x+(i-1)*.23, vals, width=.2, color=color, label=name, zorder=3)
ax.set_xticks(x, ['Adelie','Chinstrap','Gentoo'])
ax.set(ylabel='Length (mm)', ylim=(0,265))
ax.legend(loc='upper left', ncols=3, columnspacing=1.2, handlelength=1)
save(fig, 'bars.png')

# scatter_hist: preserve the seeded 1000 observations and fixed-width bins.
rng = np.random.RandomState(19680801)
x, y = rng.randn(1000), rng.randn(1000)
fig = plt.figure(figsize=(7.2,5.0))
gs = fig.add_gridspec(2,2,width_ratios=[4,1],height_ratios=[1,4],
    left=.12,right=.94,bottom=.15,top=.95,hspace=.08,wspace=.08)
ax = fig.add_subplot(gs[1,0]); top = fig.add_subplot(gs[0,0], sharex=ax)
right = fig.add_subplot(gs[1,1], sharey=ax)
ax.scatter(x,y,s=9,color=BLUE,alpha=.4,edgecolors='none')
lim = (int(max(np.max(abs(x)),np.max(abs(y)))/.25)+1)*.25
bins = np.arange(-lim,lim+.25,.25)
top.hist(x,bins=bins,color=BLUE,rwidth=.9)
right.hist(y,bins=bins,color=TEAL,rwidth=.9,orientation='horizontal')
for margin in [top,right]: margin.set_axis_off()
ax.set(xlabel='x',ylabel='y'); ax.grid(alpha=.7)
save(fig,'scatter.png')

# hist: same seeded normal observations, one clear panel instead of two tutorial axes.
rng = np.random.default_rng(19680801)
dist = rng.standard_normal(100000)
fig,ax = figure()
ax.hist(dist,bins=20,color=BLUE,rwidth=.88,zorder=3)
ax.set(xlabel='Value',ylabel='Count')
save(fig,'histogram.png')

# contour_demo: same analytical response surface, restrained warm/cool contours.
x = np.arange(-3,3,.025); y = np.arange(-2,2,.025)
X,Y = np.meshgrid(x,y)
Z = 2*(np.exp(-X**2-Y**2)-np.exp(-(X-1)**2-(Y-1)**2))
fig,ax = figure(); ax.grid(False)
cs = ax.contour(X,Y,Z,levels=[-1.5,-1,-.5,0,.5,1,1.5],colors=['#b57a57','#c79777','#dbbba5','#a4acb3','#a7c1d7','#739dbf','#3976a8'],linewidths=1.5)
ax.clabel(cs,fontsize=9,inline=True)
ax.set(xlabel='x',ylabel='y')
save(fig,'contour.png')

# hexbin_demo: same seeded 100000 observations, with a contrasting dark panel.
rng = np.random.RandomState(19680801)
x = rng.standard_normal(100000); y = 2+3*x+4*rng.standard_normal(100000)
fig,ax = figure()
fig.set_facecolor('#18212b'); ax.set_facecolor('#18212b')
ax.grid(False)
for spine in ax.spines.values(): spine.set_edgecolor('#52606d')
ax.tick_params(colors='#c2ccd5')
density_cmap = LinearSegmentedColormap.from_list('labflow_density',['#25384a','#438fac','#bce6e7'])
hb = ax.hexbin(x,y,gridsize=45,mincnt=1,cmap=density_cmap,linewidths=0,zorder=3)
ax.set(xlabel='x',ylabel='y',xlim=(x.min(),x.max()),ylim=(y.min(),y.max()))
cb = fig.colorbar(hb,ax=ax,pad=.04,fraction=.03); cb.outline.set_visible(False)
cb.set_label('Count',fontsize=10,color='#c2ccd5')
cb.ax.tick_params(colors='#c2ccd5')
ax.xaxis.label.set_color('#c2ccd5'); ax.yaxis.label.set_color('#c2ccd5')
fig.savefig(OUT/'density.png',dpi=170,facecolor='#18212b',metadata={'Software':'LabFlow static showcase renderer'})
plt.close(fig)

# errorbar: upstream illustrative function and constant x/y errors, never experimental claims.
x = np.arange(.1,4,.5); y = np.exp(-x)
fig,ax = figure()
ax.errorbar(x,y,xerr=.2,yerr=.4,color=BLUE,ecolor='#9eb4c5',linewidth=1.6,
    elinewidth=1,capsize=3,fmt='o-',markersize=4)
ax.set(xlabel='x',ylabel='y')
save(fig,'errors.png')

# stackplot_demo: its seeded Gaussian-mixture streamgraph, not UN population data.
rng = np.random.RandomState(19680801)
x = np.linspace(0,100,101)
def mixture():
    result = np.zeros_like(x)
    for _ in range(5):
        amp = 1/(.1+rng.random()); dx = x[-1]-x[0]
        x0 = (2*rng.random()-.5)*dx; z = 10/(.1+rng.random())/dx
        result += amp*np.exp(-(z*(x-x0))**2)
    return result
ys = [mixture() for _ in range(3)]
fig,ax = figure()
ax.stackplot(x,ys,baseline='wiggle',colors=[BLUE,TEAL,'#dbb394'],linewidth=0)
ax.set(xlabel='x',ylabel='Stacked value',xlim=(0,100))
save(fig,'areas.png')

manifest = json.loads((OUT/'sources.json').read_text(encoding='utf-8'))
for asset in manifest['assets']:
    asset.setdefault('original_image_sha256', asset['sha256'])
    asset['modified'] = True
    asset['changes'] = 'Re-rendered from upstream example data recipes: coordinated blue/teal/copper palette, typography, dimensions and layout; selected correlation matrix and streamgraph examples.'
    asset['data_kind'] = 'upstream_illustrative_example'
    asset['render_script'] = 'scripts/render-showcase.py'
    asset['sha256'] = hashlib.sha256((OUT/asset['file']).read_bytes()).hexdigest()
    if asset['file']=='heatmap.png': asset['title']='相关性矩阵'
    if asset['file']=='bars.png':
        asset['data_source']='Palmer Penguins summary values as provided by Matplotlib barchart example; https://allisonhorst.github.io/palmerpenguins/'
    if asset['file']=='areas.png':
        asset['data_source']='Seeded Gaussian mixture from stackplot_demo streamgraph section; does not use UN population data.'
manifest['rendering'] = {'matplotlib':matplotlib.__version__,'numpy':np.__version__,
    'recipe':'scripts/render-showcase.py','palette':'blue-teal-copper with one dark plate','seed':19680801}
(OUT/'sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print('Rendered 10 coordinated reference plates; upstream example recipes retained.')
